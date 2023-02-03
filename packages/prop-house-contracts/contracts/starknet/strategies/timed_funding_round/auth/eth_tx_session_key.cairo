%lang starknet

from starkware.cairo.common.cairo_builtins import HashBuiltin, SignatureBuiltin
from starkware.cairo.common.alloc import alloc
from starkware.cairo.common.memcpy import memcpy

from contracts.starknet.common.lib.execute import execute
from contracts.starknet.common.lib.eth_tx import EthTx
from contracts.starknet.strategies.timed_funding_round.lib.session_key import SessionKey
from contracts.starknet.strategies.timed_funding_round.lib.stark_eip191 import StarkEIP191

// print(get_selector_from_name("propose"))
const PROPOSAL_SELECTOR = 0x1bfd596ae442867ef71ca523061610682af8b00fc2738329422f4ad8d220b81;
// print(get_selector_from_name("vote"))
const VOTE_SELECTOR = 0x132bdf85fc8aa10ac3c22f02317f8f53d4b4f52235ed1eabb3a4cbbe08b5c41;
// print(get_selector_from_name("cancel_proposal"))
const CANCEL_PROPOSAL_SELECTOR = 0xf58b7fa5874c036308bea0b54ae78e8ecf78d868aa18e666aa7fc4e0cbed6d;
// print(get_selector_from_name("cancel_round"))
const CANCEL_ROUND_SELECTOR = 0x8af3ea41808c9515720e56add54a2d8008458a8bc5e347b791c6d75cd0e407;

@constructor
func constructor{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}(
    starknet_commit_address: felt
) {
    EthTx.initializer(starknet_commit_address);
    return ();
}

// Calls get_session_key with the ethereum address (calldata[0]) to check that a session is active.
// If so, perfoms stark signature verification to check the sig is valid. If so calls execute with the payload.
@external
func authenticate{
    syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr, ecdsa_ptr: SignatureBuiltin*
}(
    r: felt,
    s: felt,
    salt: felt,
    target: felt,
    function_selector: felt,
    calldata_len: felt,
    calldata: felt*,
    session_public_key: felt,
) {
    let eth_address = calldata[0];
    SessionKey.assert_valid(session_public_key, eth_address);

    // Check signature with session key
    if (function_selector == PROPOSAL_SELECTOR) {
        StarkEIP191.verify_propose_sig(
            r, s, salt, target, calldata_len, calldata, session_public_key
        );
    } else {
        if (function_selector == VOTE_SELECTOR) {
            StarkEIP191.verify_vote_sig(
                r, s, salt, target, calldata_len, calldata, session_public_key
            );
        } else {
            if (function_selector == CANCEL_PROPOSAL_SELECTOR) {
                StarkEIP191.verify_cancel_proposal_sig(
                    r, s, salt, target, calldata_len, calldata, session_public_key
                );
            } else {
                if (function_selector == CANCEL_ROUND_SELECTOR) {
                    StarkEIP191.verify_cancel_round_sig(
                        r, s, salt, target, calldata_len, calldata, session_public_key
                    );
                } else {
                    // Invalid selector
                    return ();
                }
            }
        }
    }

    // Call the contract
    execute(target, function_selector, calldata_len, calldata);

    return ();
}

@external
func authorize_session_key_with_tx{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}(
    eth_address: felt, session_public_key: felt, session_duration: felt
) {
    SessionKey.authorize_with_tx(eth_address, session_public_key, session_duration);
    return ();
}

// Checks signature is valid and if so, removes session key for user
@external
func revoke_session_key_with_session_key_sig{
    syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr, ecdsa_ptr: SignatureBuiltin*
}(r: felt, s: felt, salt: felt, session_public_key: felt) {
    SessionKey.revoke_with_session_key_sig(r, s, salt, session_public_key);
    return ();
}

@external
func revoke_session_key_with_owner_tx{
    syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr
}(session_public_key: felt) {
    SessionKey.revoke_with_owner_tx(session_public_key);
    return ();
}

// Public view function for checking a session key
@view
func get_session_key_owner{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr}(
    session_public_key: felt
) -> (eth_address: felt) {
    let (eth_address) = SessionKey.get_owner(session_public_key);
    return (eth_address,);
}

// Receives hash from StarkNet commit contract and stores it in state.
@l1_handler
func commit{syscall_ptr: felt*, pedersen_ptr: HashBuiltin*, range_check_ptr: felt}(
    from_address: felt, sender: felt, hash: felt
) {
    EthTx.commit(from_address, sender, hash);
    return ();
}