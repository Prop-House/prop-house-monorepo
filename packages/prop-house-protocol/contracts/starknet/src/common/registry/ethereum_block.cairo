#[starknet::interface]
trait IL1HeadersStore<TContractState> {
    fn get_latest_processed_block(self: @TContractState) -> u256;
}

#[starknet::interface]
trait IEthereumBlockRegistry<TContractState> {
    fn get_eth_block_number(ref self: TContractState, timestamp: u64) -> felt252;
}

#[starknet::contract]
mod EthereumBlockRegistry {
    use starknet::{ContractAddress, get_block_timestamp};
    use super::{IEthereumBlockRegistry, IL1HeadersStoreDispatcherTrait, IL1HeadersStoreDispatcher};
    use option::OptionTrait;
    use zeroable::Zeroable;
    use traits::TryInto;

    #[storage]
    struct Storage {
        _l1_headers_store: ContractAddress,
        _timestamp_to_eth_block_number: LegacyMap<u64, felt252>,
    }

    #[constructor]
    fn constructor(ref self: ContractState, l1_headers_store: ContractAddress) {
        initializer(ref self, l1_headers_store);
    }

    #[external(v0)]
    impl EthereumBlockRegistry of IEthereumBlockRegistry<ContractState> {
        /// Returns the closest ethereum block number for the given timestamp.
        /// * `timestamp` - The timestamp to query.
        fn get_eth_block_number(ref self: ContractState, timestamp: u64) -> felt252 {
            let number = self._timestamp_to_eth_block_number.read(timestamp);
            if number.is_non_zero() {
                // The timestamp has already be queried in herodotus and stored. Therefore we can just return the stored value
                // This branch will be taken whenever a vote is cast as the mapping value would be set at proposal creation.
                number
            } else {
                // The timestamp has not yet been queried in herodotus. Therefore we must query Herodotus for the latest eth block
                // number stored there and store it here in the mapping indexed by the timestamp provided.
                // This branch will be taken whenever a proposal is created, except for the (rare) case of multiple proposals
                // being created in the same block.
                assert(timestamp <= get_block_timestamp(), 'EBR: Cannot query the future');

                let number = IL1HeadersStoreDispatcher {
                    contract_address: self._l1_headers_store.read()
                }.get_latest_processed_block().try_into().unwrap();
                self._timestamp_to_eth_block_number.write(timestamp, number);
                number
            }
        }
    }

    /// Initializes the contract.
    /// * `l1_headers_store_` - The address of the Herodotus L1 header store contract.
    fn initializer(ref self: ContractState, l1_headers_store_: ContractAddress) {
        self._l1_headers_store.write(l1_headers_store_);
    }
}
