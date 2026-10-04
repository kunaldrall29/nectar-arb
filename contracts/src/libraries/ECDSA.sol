// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {InvalidSignature} from "../Errors.sol";

library ECDSA {
    uint256 internal constant HALF_N = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;
    bytes4 internal constant EIP1271_MAGIC = 0x1626ba7e;

    function recover(bytes32 digest, bytes memory signature) internal pure returns (address) {
        if (signature.length != 65) revert InvalidSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly ("memory-safe") {
            r := mload(add(signature, 0x20))
            s := mload(add(signature, 0x40))
            v := byte(0, mload(add(signature, 0x60)))
        }
        if (uint256(s) > HALF_N) revert InvalidSignature();
        if (v != 27 && v != 28) revert InvalidSignature();
        address signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidSignature();
        return signer;
    }

    function isValidSignature(address maker, bytes32 digest, bytes memory signature) internal view returns (bool) {
        if (maker.code.length == 0) {
            return recover(digest, signature) == maker;
        }
        (bool ok, bytes memory ret) = maker.staticcall(abi.encodeWithSelector(EIP1271_MAGIC, digest, signature));
        if (!ok || ret.length < 32) return false;
        return abi.decode(ret, (bytes4)) == EIP1271_MAGIC;
    }
}
