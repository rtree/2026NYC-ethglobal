// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Minimal Uniswap v3 SwapRouter02 surface used by the delegate.
/// @dev SwapRouter02 (Base) `exactInputSingle` has no deadline in the struct.
interface ISwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}
