import { RpcProvider, hash, validateAndParseAddress } from 'starknet';
import { parseEvent } from 'checkpoint-beta/dist/src/providers/starknet/utils';
import { isFullBlock, isDeployTransaction } from 'checkpoint-beta/dist/src/types';
import { BaseProvider, BlockNotFoundError } from 'checkpoint-beta/dist/src/providers';
import type {
  Block,
  FullBlock,
  Transaction,
  PendingTransaction,
  Event,
  EventsMap,
  ParsedEvent,
  ContractSourceConfig,
} from 'checkpoint-beta/dist/src/types';

export class StarknetProvider extends BaseProvider {
  private readonly provider: RpcProvider;
  private processedPoolTransactions = new Set();

  constructor({ instance, log, abis }: ConstructorParameters<typeof BaseProvider>[0]) {
    super({ instance, log, abis });

    this.provider = new RpcProvider({
      nodeUrl: this.instance.config.network_node_url,
    });
  }

  async getNetworkIdentifier(): Promise<string> {
    const result = await this.provider.getChainId();
    return `starknet_${result}`;
  }

  async processBlock(blockNum: number) {
    let block: Block;
    let blockEvents: EventsMap;
    try {
      [block, blockEvents] = await Promise.all([
        this.provider.getBlockWithTxs(blockNum) as Promise<Block>,
        this.getEvents(blockNum),
      ]);

      if (!isFullBlock(block) || block.block_number !== blockNum) {
        this.log.error({ blockNumber: blockNum }, 'invalid block');
        throw new Error('invalid block');
      }
    } catch (e) {
      if ((e as Error).message.includes('Block not found')) {
        this.log.info({ blockNumber: blockNum }, 'block not found');
        throw new BlockNotFoundError();
      }

      this.log.error({ blockNumber: blockNum, err: e }, 'getting block failed... retrying');
      throw e;
    }

    await this.handleBlock(block, blockEvents);

    await this.instance.setLastIndexedBlock(block.block_number);

    return blockNum + 1;
  }

  async processPool(blockNumber: number) {
    const txs = await this.provider.getPendingTransactions();
    const receipts = await Promise.all(
      txs.map(async tx => {
        if (!tx.transaction_hash) return null;

        try {
          return await this.provider.getTransactionReceipt(tx.transaction_hash);
        } catch (err) {
          this.log.warn(
            { transactionHash: tx.transaction_hash, err },
            'getting transaction receipt failed',
          );
          return null;
        }
      }),
    );

    const txsWithReceipts = txs.filter((_, index) => receipts[index] !== null) as PendingTransaction[];
    const eventsMap = receipts.reduce((acc: Record<string, any>, receipt) => {
      if (receipt === null) return acc;

      acc[receipt.transaction_hash] = receipt.events;
      return acc;
    }, {});

    await this.handlePool(txsWithReceipts, eventsMap, blockNumber);
  }

  private async handleBlock(block: FullBlock, eventsMap: EventsMap) {
    this.log.info({ blockNumber: block.block_number }, 'handling block');

    // Unlike the internal provider, we re-emit events on confirmation
    for (const [i, tx] of block.transactions.entries()) {
      await this.handleTx(
        block,
        block.block_number,
        i,
        tx,
        tx.transaction_hash ? eventsMap[tx.transaction_hash] || [] : [],
      );
    }

    block.transactions.forEach(tx => this.processedPoolTransactions.delete(tx.transaction_hash));

    this.log.debug({ blockNumber: block.block_number }, 'handling block done');
  }

  private async handlePool(txs: PendingTransaction[], eventsMap: EventsMap, blockNumber: number) {
    this.log.info('handling pool');

    const txsToCheck = txs.filter(tx => !this.processedPoolTransactions.has(tx.transaction_hash));

    for (const [i, tx] of txsToCheck.entries()) {
      await this.handleTx(
        null,
        blockNumber,
        i,
        tx,
        tx.transaction_hash ? eventsMap[tx.transaction_hash] || [] : [],
      );

      this.processedPoolTransactions.add(tx.transaction_hash);
    }

    this.log.info('handling pool done');
  }

  private async handleTx(
    block: FullBlock | null,
    blockNumber: number,
    txIndex: number,
    tx: Transaction,
    events: Event[],
  ) {
    this.log.debug({ txIndex }, 'handling transaction');

    const writerParams = await this.instance.getWriterParams();

    if (this.instance.config.tx_fn) {
      await this.instance.writer[this.instance.config.tx_fn]({
        blockNumber,
        block,
        tx,
        ...writerParams,
      });
    }

    if (this.instance.config.global_events) {
      const globalEventHandlers = this.instance.config.global_events.reduce(
        (handlers: Record<string, { name: string; fn: string }>, event) => {
          handlers[`0x${hash.starknetKeccak(event.name).toString(16)}`] = {
            name: event.name,
            fn: event.fn,
          };
          return handlers;
        },
        {},
      );

      for (const [eventIndex, event] of events.entries()) {
        const handler = globalEventHandlers[event.keys[0]];
        if (!handler) continue;

        this.log.info(
          { contract: event.from_address, event: handler.name, handlerFn: handler.fn },
          'found contract event',
        );

        await this.instance.writer[handler.fn]({
          block,
          blockNumber,
          tx,
          rawEvent: event,
          eventIndex,
          ...writerParams
        });
      }
    }

    let lastSources = this.instance.getCurrentSources(blockNumber);
    const sourcesQueue = [...lastSources];

    let source: ContractSourceConfig | undefined;
    while ((source = sourcesQueue.shift())) {
      let foundContractData = false;
      const contract = validateAndParseAddress(source.contract);

      if (
        isDeployTransaction(tx) &&
        source.deploy_fn &&
        contract === validateAndParseAddress(tx.contract_address)
      ) {
        foundContractData = true;
        this.log.info(
          { contract: source.contract, txType: tx.type, handlerFn: source.deploy_fn },
          'found deployment transaction',
        );

        await this.instance.writer[source.deploy_fn]({
          source,
          block,
          blockNumber,
          tx,
          ...writerParams,
        });
      }

      for (const [eventIndex, event] of events.entries()) {
        if (contract === validateAndParseAddress(event.from_address)) {
          for (const sourceEvent of source.events) {
            if (`0x${hash.starknetKeccak(sourceEvent.name).toString(16)}` === event.keys[0]) {
              foundContractData = true;
              this.log.info(
                { contract: source.contract, event: sourceEvent.name, handlerFn: sourceEvent.fn },
                'found contract event',
              );

              let parsedEvent: ParsedEvent | undefined;
              if (source.abi && this.abis?.[source.abi]) {
                try {
                  parsedEvent = parseEvent(this.abis[source.abi], event);
                } catch (err) {
                  this.log.warn(
                    { contract: source.contract, txType: tx.type, handlerFn: source.deploy_fn },
                    'failed to parse event',
                  );
                }
              }

              await this.instance.writer[sourceEvent.fn]({
                source,
                block,
                blockNumber,
                tx,
                rawEvent: event,
                event: parsedEvent,
                eventIndex,
                ...writerParams,
              });
            }
          }
        }
      }

      if (foundContractData) {
        await this.instance.insertCheckpoints([{ blockNumber, contractAddress: source.contract }]);
      }

      const nextSources = this.instance.getCurrentSources(blockNumber);
      const newSources = nextSources.filter(
        nextSource => !lastSources.find(lastSource => lastSource.contract === nextSource.contract)
      );

      sourcesQueue.push(...newSources);
      lastSources = nextSources;
    }

    this.log.debug({ txIndex }, 'handling transaction done');
  }

  private async getEvents(blockNumber: number): Promise<EventsMap> {
    const events: Event[] = [];

    let continuationToken: string | undefined;
    do {
      const result = await this.provider.getEvents({
        from_block: { block_number: blockNumber },
        to_block: { block_number: blockNumber },
        chunk_size: 1000,
        continuation_token: continuationToken,
      });

      events.push(...result.events);

      continuationToken = result.continuation_token;
    } while (continuationToken);

    return events.reduce((acc: Record<string, Event[]>, event) => {
      if (!acc[event.transaction_hash]) acc[event.transaction_hash] = [];

      acc[event.transaction_hash].push(event);

      return acc;
    }, {});
  }
}
