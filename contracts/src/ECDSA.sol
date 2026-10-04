// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

library ECDSA {
    /// @dev Rejects malleable signatures. Returns address(0) on any malformed input.
    function recover(bytes32 digest, bytes calldata signature) internal pure returns (address) {
        if (signature.length != 65) return address(0);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (v < 27) {
            if (v != 0 && v != 1) return address(0);
            v += 27;
        }
        if (v != 27 && v != 28) return address(0);
        // secp256k1n / 2
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) return address(0);
        address signer = ecrecover(digest, v, r, s);
        return signer;
    }
}
