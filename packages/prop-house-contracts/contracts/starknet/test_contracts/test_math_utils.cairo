%lang starknet

from starkware.cairo.common.uint256 import Uint256
from starkware.cairo.common.cairo_builtins import BitwiseBuiltin

from contracts.starknet.common.lib.math_utils import MathUtils

@view
func test_words_to_uint256{range_check_ptr}(word1: felt, word2: felt, word3: felt, word4: felt) -> (
    uint256: Uint256
) {
    let (uint256) = MathUtils.words_to_uint256(word1, word2, word3, word4);
    return (uint256,);
}

@view
func test_pack_felt{range_check_ptr}(num1: felt, num2: felt, num3: felt) -> (packed: felt) {
    let (packed) = MathUtils.pack_3_40_bit(num1, num2, num3);
    return (packed,);
}

@view
func test_unpack_felt{range_check_ptr, bitwise_ptr: BitwiseBuiltin*}(packed: felt) -> (
    num1: felt, num2: felt, num3: felt
) {
    alloc_locals;
    let (num1, num2, num3) = MathUtils.unpack_3_40_bit(packed);
    return (num1, num2, num3);
}
