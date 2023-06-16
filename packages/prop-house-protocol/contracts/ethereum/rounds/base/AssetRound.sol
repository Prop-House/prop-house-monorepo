// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.8.17;

import { Round } from './Round.sol';
import { IERC165 } from '../../interfaces/IERC165.sol';
import { AssetHelper } from '../../lib/utils/AssetHelper.sol';
import { IAssetRound } from '../../interfaces/IAssetRound.sol';
import { PackedAsset, Asset } from '../../lib/types/Common.sol';
import { AssetController } from '../../lib/utils/AssetController.sol';
import { ITokenMetadataRenderer } from '../../interfaces/ITokenMetadataRenderer.sol';
import { DepositReceiver } from '../../lib/utils/DepositReceiver.sol';
import { MerkleProof } from '../../lib/utils/MerkleProof.sol';
import { TokenHolder } from '../../lib/utils/TokenHolder.sol';
import { ERC1155 } from '../../lib/token/ERC1155.sol';
import { Uint256 } from '../../lib/utils/Uint256.sol';

abstract contract AssetRound is IAssetRound, Round, AssetController, TokenHolder, ERC1155, DepositReceiver {
    using { Uint256.mask250 } for bytes32;
    using { AssetHelper.packMany } for Asset[];
    using { AssetHelper.toID, AssetHelper.pack } for Asset;

    /// @notice The Asset Metadata Renderer contract
    ITokenMetadataRenderer public immutable renderer;

    /// @notice Determine if a winner has claimed their award asset
    /// @dev Proposal IDs map to bits in the uint256 mapping
    mapping(uint256 => uint256) private _assetClaimStatus;

    constructor(
        bytes32 _kind,
        uint256 _classHash,
        address _propHouse,
        address _starknet,
        address _messenger,
        uint256 _roundFactory,
        uint256 _executionRelayer,
        address _renderer
    ) Round(_kind, _classHash, _propHouse, _starknet, _messenger, _roundFactory, _executionRelayer) {
        renderer = ITokenMetadataRenderer(_renderer);
    }

    /// @notice Returns the deposit token URI for the provided token ID
    /// @param tokenId The deposit token ID
    function uri(uint256 tokenId) public view override returns (string memory) {
        return renderer.tokenURI(tokenId);
    }

    // prettier-ignore
    /// @notice If the contract implements an interface
    /// @param interfaceId The interface id
    function supportsInterface(bytes4 interfaceId) public view virtual override(DepositReceiver, TokenHolder, ERC1155, IERC165) returns (bool) {
        return DepositReceiver.supportsInterface(interfaceId) || TokenHolder.supportsInterface(interfaceId) || ERC1155.supportsInterface(interfaceId);
    }

    /// @notice Issue a deposit receipt to the provided address
    /// @param to The recipient address
    /// @param identifier The token identifier
    /// @param amount The token amount
    /// @dev This function is only callable by the prop house contract
    function _issueReceipt(address to, uint256 identifier, uint256 amount) internal {
        _mint(to, identifier, amount, new bytes(0));
    }

    /// @notice Issue one or more deposit receipts to the provided address
    /// @param to The recipient address
    /// @param identifiers The token identifiers
    /// @param amounts The token amounts
    /// @dev This function is only callable by the prop house contract
    function _issueReceipts(address to, uint256[] memory identifiers, uint256[] memory amounts) internal {
        _batchMint(to, identifiers, amounts, new bytes(0));
    }

    /// @notice Claim a round award asset to a custom recipient
    /// @param recipient The asset recipient
    /// @param proposalId The winning proposal ID
    /// @param asset The asset to claim
    /// @param proof The merkle proof used to verify the validity of the asset payout
    function _claimTo(
        address recipient,
        uint256 proposalId,
        Asset calldata asset,
        bytes32[] calldata proof
    ) internal {
        address caller = msg.sender;
        if (isClaimed(proposalId)) {
            revert ALREADY_CLAIMED();
        }
        PackedAsset memory packed = asset.pack();

        bytes32 leaf = keccak256(abi.encode(proposalId, caller, packed));
        if (!MerkleProof.verify(proof, winnerMerkleRoot, leaf)) {
            revert INVALID_MERKLE_PROOF();
        }
        _setClaimed(proposalId);
        _transfer(asset, address(this), payable(recipient));

        emit AssetClaimed(proposalId, caller, recipient, packed);
    }

    /// @notice Claim many round award assets to a custom recipient
    /// @param recipient The asset recipient
    /// @param proposalId The winning proposal ID
    /// @param assets The assets to claim
    /// @param proof The merkle proof used to verify the validity of the asset payout
    function _claimManyTo(
        address recipient,
        uint256 proposalId,
        Asset[] calldata assets,
        bytes32[] calldata proof
    ) internal {
        address caller = msg.sender;
        if (isClaimed(proposalId)) {
            revert ALREADY_CLAIMED();
        }
        PackedAsset[] memory packed = assets.packMany();
        bytes32 leaf = keccak256(
            abi.encode(proposalId, caller, keccak256(abi.encode(packed)).mask250())
        );
        if (!MerkleProof.verify(proof, winnerMerkleRoot, leaf)) {
            revert INVALID_MERKLE_PROOF();
        }
        _setClaimed(proposalId);

        uint256 assetCount = assets.length;
        for (uint256 i = 0; i < assetCount; ) {
            _transfer(assets[i], address(this), payable(recipient));
            unchecked {
                ++i;
            }
        }
        emit AssetsClaimed(proposalId, caller, recipient, packed);
    }

    /// @notice Reclaim assets to a custom recipient
    /// @param recipient The asset recipient
    /// @param assets The assets to reclaim
    function _reclaimTo(address recipient, Asset[] calldata assets) internal {
        uint256 assetCount = assets.length;
        address caller = msg.sender;

        for (uint256 i = 0; i < assetCount; ) {
            uint256 assetId = assets[i].toID();

            // Burn deposit credits. This will revert if the caller does not have enough credits.
            _burn(caller, assetId, assets[i].amount);

            // Transfer the asset to the recipient
            _transfer(assets[i], address(this), payable(recipient));

            unchecked {
                ++i;
            }
        }
    }

    /// @notice Determine whether an asset has been claimed for a specific proposal ID
    /// @param proposalId The proposal ID
    function isClaimed(uint256 proposalId) public view returns (bool claimed) {
        uint256 isBitSet = (_assetClaimStatus[proposalId >> 8] >> (proposalId & 0xff)) & 1;
        assembly {
            claimed := isBitSet
        }
    }

    /// @notice Mark an asset as 'claimed' for the provided proposal ID
    /// @param proposalId The winning proposal ID
    function _setClaimed(uint256 proposalId) internal {
        _assetClaimStatus[proposalId >> 8] |= (1 << (proposalId & 0xff));
    }
}
