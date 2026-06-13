// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

import {ExecutionDelegate7702} from "../src/ExecutionDelegate7702.sol";
import {Action, HardGuardState, ExecutionRequest, IIntentOSErrors} from "../src/IntentOSTypes.sol";
import {ISwapRouter02} from "../src/interfaces/ISwapRouter02.sol";

/// @notice Fork smoke test: a real USDC->WETH swap on Base through the real Uniswap SwapRouter02,
///         driven by the delegate's guarded path. Proves the router integration on mainnet state.
/// @dev    Runs only when BASE_RPC_URL is set; otherwise skipped. `forge test --match-contract Fork`.
contract ExecutionDelegate7702ForkTest is Test, IIntentOSErrors {
    address internal constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address internal constant WETH = 0x4200000000000000000000000000000000000006;
    address internal constant ROUTER = 0x2626664c2603336E57B271c5C0b26F421741e481; // Uniswap SwapRouter02 (Base)
    uint24 internal constant FEE = 500;

    ExecutionDelegate7702 internal del;
    uint256 internal constant SESSION_PK = 0xA11CE;
    address internal sessionKey;
    address internal relayer;

    function setUp() public {
        string memory rpc = vm.envOr("BASE_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return; // skip path
        vm.createSelectFork(rpc);

        sessionKey = vm.addr(SESSION_PK);
        relayer = makeAddr("relayer");
        del = new ExecutionDelegate7702();

        deal(USDC, address(del), 10e6, true); // 10 USDC into the Owner EOA
        vm.deal(address(del), 1 ether);

        HardGuardState memory g = HardGuardState({
            router: ROUTER,
            selector: ISwapRouter02.exactInputSingle.selector,
            tokenA: USDC,
            tokenB: WETH,
            poolFee: FEE,
            amountCapPerTx: 5e6,
            cumulativeCap: 100e6,
            slippageCapBps: 100,
            expiry: uint64(block.timestamp + 1 days),
            frozen: false,
            bindingNonce: 1
        });
        vm.prank(address(del));
        del.initialize(g, sessionKey, address(0), relayer, 0.01 ether, 0.5 ether, 0, keccak256("pkg"), keccak256("sem"));
    }

    function test_fork_realSwap() public {
        if (address(del) == address(0)) {
            vm.skip(true);
            return;
        }
        ExecutionRequest memory r = ExecutionRequest({
            intentId: keccak256("intent-abc"),
            executorAgentTokenId: 1,
            action: uint8(Action.BUY),
            tokenIn: USDC,
            tokenOut: WETH,
            recipient: address(del),
            amountIn: 1e6, // 1 USDC (fork sim, not real funds)
            minAmountOut: 1, // smoke test: accept any positive output
            quotedAmountOut: 0,
            slippageBps: 0,
            nonce: 1,
            deadline: uint64(block.timestamp + 1 hours),
            bindingNonce: 1,
            quoteHash: keccak256("q"),
            simulationHash: keccak256("s"),
            evidenceRoot: keccak256("e"),
            reasonHash: keccak256(bytes("fork"))
        });
        bytes32 inner = keccak256(abi.encode(block.chainid, address(del), r));
        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(inner);
        (uint8 v, bytes32 rr, bytes32 ss) = vm.sign(SESSION_PK, digest);

        uint256 wethBefore = IERC20(WETH).balanceOf(address(del));
        vm.prank(relayer);
        del.submitExecutionRequest(r, "fork", abi.encodePacked(rr, ss, v));
        assertGt(IERC20(WETH).balanceOf(address(del)), wethBefore, "received WETH");
    }
}
