%lang starknet

from starkware.cairo.common.uint256 import Uint256

@contract_interface
namespace IVotingStrategy {
    func get_voting_power(
        timestamp: felt,
        voter_address: felt,
        params_len: felt,
        params: felt*,
        user_params_len: felt,
        user_params: felt*,
    ) -> (voting_power: Uint256) {
    }
}