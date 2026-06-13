// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ISwapRouter02} from "../../src/interfaces/ISwapRouter02.sol";
import {MockERC20} from "./MockERC20.sol";

/// @notice Minimal Uniswap-like router for tests. `nextAmountOut` lets a test control the received
///         amount precisely; `enforceMin=false` lets us return below min to exercise the delegate's
///         own post-swap slippage check.
contract MockSwapRouter is ISwapRouter02 {
    uint256 public nextAmountOut;
    bool public enforceMin = true;

    function setNextAmountOut(uint256 a) external {
        nextAmountOut = a;
    }

    function setEnforceMin(bool e) external {
        enforceMin = e;
    }

    function exactInputSingle(ExactInputSingleParams calldata p) external payable returns (uint256 amountOut) {
        IERC20(p.tokenIn).transferFrom(msg.sender, address(this), p.amountIn);
        amountOut = nextAmountOut;
        if (enforceMin) require(amountOut >= p.amountOutMinimum, "Too little received");
        MockERC20(p.tokenOut).mint(p.recipient, amountOut);
    }
}
