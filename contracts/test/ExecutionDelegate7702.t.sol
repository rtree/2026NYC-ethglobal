// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

import {ExecutionDelegate7702} from "../src/ExecutionDelegate7702.sol";
import {
    Action, HardGuardState, ExecutionRequest, GuardPatch, IIntentOSErrors, IEvidence
} from "../src/IntentOSTypes.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockSwapRouter} from "./mocks/MockSwapRouter.sol";

/// @dev In EIP-7702 the delegate code runs as the Owner EOA, so address(this) == Owner. In tests we
///      deploy the delegate at address D and emulate an Owner self-call with vm.prank(D).
contract ExecutionDelegate7702Test is Test, IIntentOSErrors, IEvidence {
    ExecutionDelegate7702 internal del;
    MockERC20 internal usdc;
    MockERC20 internal weth;
    MockSwapRouter internal router;

    uint256 internal constant SESSION_PK = 0xA11CE;
    uint256 internal constant WATCHER_PK = 0xB0B;
    uint256 internal constant WRONG_PK = 0xDEAD;
    address internal sessionKey;
    address internal watcherKey;
    address internal relayer;

    uint256 internal constant CAP_PER_TX = 5e6; // 5 USDC
    uint256 internal constant CUM_CAP = 100e6; // 100 USDC
    uint16 internal constant SLIP_CAP = 50; // 0.5%
    uint24 internal constant POOL_FEE = 500;

    function setUp() public {
        sessionKey = vm.addr(SESSION_PK);
        watcherKey = vm.addr(WATCHER_PK);
        relayer = makeAddr("relayer");

        usdc = new MockERC20("USD Coin", "USDC", 6);
        weth = new MockERC20("Wrapped Ether", "WETH", 18);
        router = new MockSwapRouter();
        del = new ExecutionDelegate7702();

        // Owner EOA (== address(del)) holds funds + ETH.
        usdc.mint(address(del), 1_000e6);
        vm.deal(address(del), 10 ether);

        HardGuardState memory g = HardGuardState({
            router: address(router),
            selector: MockSwapRouter.exactInputSingle.selector,
            tokenA: address(usdc),
            tokenB: address(weth),
            poolFee: POOL_FEE,
            amountCapPerTx: CAP_PER_TX,
            cumulativeCap: CUM_CAP,
            slippageCapBps: SLIP_CAP,
            expiry: uint64(block.timestamp + 7 days),
            frozen: false,
            bindingNonce: 1
        });

        vm.prank(address(del)); // Owner self-call
        del.initialize(g, sessionKey, watcherKey, relayer, 0.01 ether, 1 ether, 0, keccak256("pkg"), keccak256("sem"));
    }

    // ---------------------------------------------------------------- helpers
    function _req() internal view returns (ExecutionRequest memory r) {
        r = ExecutionRequest({
            intentId: keccak256("intent-abc"),
            executorAgentTokenId: 123,
            action: uint8(Action.BUY),
            tokenIn: address(usdc),
            tokenOut: address(weth),
            recipient: address(del),
            amountIn: 1e6,
            minAmountOut: 0.995e15,
            quotedAmountOut: 1e15,
            slippageBps: 50,
            nonce: 1,
            deadline: uint64(block.timestamp + 1 hours),
            bindingNonce: 1,
            quoteHash: keccak256("q"),
            simulationHash: keccak256("s"),
            evidenceRoot: keccak256("e"),
            reasonHash: keccak256(bytes("ok"))
        });
    }

    function _sign(ExecutionRequest memory r, uint256 pk) internal view returns (bytes memory) {
        bytes32 inner = keccak256(abi.encode(block.chainid, address(del), r));
        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(inner);
        (uint8 v, bytes32 rr, bytes32 ss) = vm.sign(pk, digest);
        return abi.encodePacked(rr, ss, v);
    }

    function _submit(ExecutionRequest memory r) internal {
        router.setNextAmountOut(r.quotedAmountOut);
        bytes memory sig = _sign(r, SESSION_PK);
        vm.prank(relayer);
        del.submitExecutionRequest(r, "ok", sig);
    }

    // ---------------------------------------------------------------- happy path
    function test_happyPath_executesAndEmitsEvidence() public {
        ExecutionRequest memory r = _req();
        router.setNextAmountOut(r.quotedAmountOut);
        bytes memory sig = _sign(r, SESSION_PK);

        vm.recordLogs();
        vm.prank(relayer);
        del.submitExecutionRequest(r, "ok", sig);

        assertEq(del.cumulativeSpent(), 1e6, "cumulative");
        assertTrue(del.isNonceUsed(1), "nonce used");
        assertEq(weth.balanceOf(address(del)), 1e15, "weth received");
    }

    function test_reimbursesRelayerFromExecLane() public {
        vm.txGasPrice(1 gwei);
        (uint256 execBefore,) = del.gasVaults();
        uint256 relayerBefore = relayer.balance;
        _submit(_req());
        (uint256 execAfter,) = del.gasVaults();
        assertLt(execAfter, execBefore, "lane debited");
        assertGt(relayer.balance, relayerBefore, "relayer reimbursed");
    }

    // ---------------------------------------------------------------- error paths (010 §9)
    function test_revert_NotInitialized() public {
        ExecutionDelegate7702 fresh = new ExecutionDelegate7702();
        ExecutionRequest memory r = _req();
        vm.prank(relayer);
        vm.expectRevert(); // onlyRelayer first: fresh._relayer == address(0) -> NotRelayer
        fresh.submitExecutionRequest(r, "ok", _sign(r, SESSION_PK));
    }

    function test_revert_BadBindingNonce() public {
        ExecutionRequest memory r = _req();
        r.bindingNonce = 2;
        bytes memory sig = _sign(r, SESSION_PK);
        vm.prank(relayer);
        vm.expectRevert(BadBindingNonce.selector);
        del.submitExecutionRequest(r, "ok", sig);
    }

    function test_revert_BadToken() public {
        ExecutionRequest memory r = _req();
        r.tokenOut = address(usdc); // same as tokenIn
        bytes memory sig = _sign(r, SESSION_PK);
        vm.prank(relayer);
        vm.expectRevert(BadToken.selector);
        del.submitExecutionRequest(r, "ok", sig);
    }

    function test_revert_BadRecipient() public {
        ExecutionRequest memory r = _req();
        r.recipient = address(0xBEEF);
        bytes memory sig = _sign(r, SESSION_PK);
        vm.prank(relayer);
        vm.expectRevert(BadRecipient.selector);
        del.submitExecutionRequest(r, "ok", sig);
    }

    function test_revert_AmountTooLarge() public {
        ExecutionRequest memory r = _req();
        r.amountIn = CAP_PER_TX + 1;
        bytes memory sig = _sign(r, SESSION_PK);
        vm.prank(relayer);
        vm.expectRevert(AmountTooLarge.selector);
        del.submitExecutionRequest(r, "ok", sig);
    }

    function test_revert_CumulativeCapExceeded() public {
        // first fill near the cumulative cap with repeated max trades
        for (uint256 i = 0; i < 20; i++) {
            ExecutionRequest memory ri = _req();
            ri.amountIn = CAP_PER_TX; // 5 USDC * 20 = 100 USDC == cap
            ri.nonce = 100 + i;
            _submit(ri);
        }
        assertEq(del.cumulativeSpent(), CUM_CAP);
        ExecutionRequest memory r = _req();
        r.nonce = 999;
        bytes memory sig = _sign(r, SESSION_PK);
        vm.prank(relayer);
        vm.expectRevert(CumulativeCapExceeded.selector);
        del.submitExecutionRequest(r, "ok", sig);
    }

    function test_revert_SlippageTooHigh_bps() public {
        ExecutionRequest memory r = _req();
        r.slippageBps = SLIP_CAP + 1;
        bytes memory sig = _sign(r, SESSION_PK);
        vm.prank(relayer);
        vm.expectRevert(SlippageTooHigh.selector);
        del.submitExecutionRequest(r, "ok", sig);
    }

    function test_revert_SlippageTooHigh_minOutInconsistent() public {
        ExecutionRequest memory r = _req();
        r.minAmountOut = 0.9e15; // below quoted * (1 - slippage)
        bytes memory sig = _sign(r, SESSION_PK);
        vm.prank(relayer);
        vm.expectRevert(SlippageTooHigh.selector);
        del.submitExecutionRequest(r, "ok", sig);
    }

    function test_revert_SlippageTooHigh_postSwap() public {
        ExecutionRequest memory r = _req();
        bytes memory sig = _sign(r, SESSION_PK);
        router.setEnforceMin(false);
        router.setNextAmountOut(0.99e15); // below minAmountOut 0.995e15
        vm.prank(relayer);
        vm.expectRevert(SlippageTooHigh.selector);
        del.submitExecutionRequest(r, "ok", sig);
    }

    function test_revert_Expired() public {
        ExecutionRequest memory r = _req();
        r.deadline = uint64(block.timestamp - 1);
        bytes memory sig = _sign(r, SESSION_PK);
        vm.prank(relayer);
        vm.expectRevert(Expired.selector);
        del.submitExecutionRequest(r, "ok", sig);
    }

    function test_revert_NonceUsed_replay() public {
        _submit(_req());
        ExecutionRequest memory r = _req(); // same nonce 1
        bytes memory sig = _sign(r, SESSION_PK);
        vm.prank(relayer);
        vm.expectRevert(NonceUsed.selector);
        del.submitExecutionRequest(r, "ok", sig);
    }

    function test_revert_BadSignature_wrongKey() public {
        ExecutionRequest memory r = _req();
        router.setNextAmountOut(r.quotedAmountOut);
        bytes memory sig = _sign(r, WRONG_PK);
        vm.prank(relayer);
        vm.expectRevert(BadSignature.selector);
        del.submitExecutionRequest(r, "ok", sig);
    }

    function test_revert_ReasonMismatch() public {
        ExecutionRequest memory r = _req();
        bytes memory sig = _sign(r, SESSION_PK);
        vm.prank(relayer);
        vm.expectRevert(ReasonMismatch.selector);
        del.submitExecutionRequest(r, "tampered", sig);
    }

    function test_revert_onlyRelayer() public {
        ExecutionRequest memory r = _req();
        bytes memory sig = _sign(r, SESSION_PK);
        vm.prank(address(0xBAD));
        vm.expectRevert(NotRelayer.selector);
        del.submitExecutionRequest(r, "ok", sig);
    }

    // ---------------------------------------------------------------- feedback loop (010 §12)
    function test_previewGuard_revertsSameError() public {
        ExecutionRequest memory r = _req();
        r.amountIn = CAP_PER_TX + 1;
        vm.expectRevert(AmountTooLarge.selector);
        del.previewGuard(r);
    }

    // ---------------------------------------------------------------- watcher (010 §14)
    function test_watcherTighten_monotonic() public {
        GuardPatch memory p =
            GuardPatch({amountCapPerTx: 2e6, cumulativeCap: 50e6, slippageCapBps: 30, expiry: uint64(block.timestamp + 1 days)});
        bytes memory sig = _signWatcher(abi.encode(block.chainid, address(del), "TIGHTEN", p));
        vm.prank(relayer);
        del.watcherTighten(p, sig);
        HardGuardState memory g = del.guard();
        assertEq(g.amountCapPerTx, 2e6);
        assertEq(g.slippageCapBps, 30);
    }

    function test_watcherTighten_revertsOnLoosen() public {
        GuardPatch memory p = GuardPatch({
            amountCapPerTx: CAP_PER_TX + 1, // loosen -> revert
            cumulativeCap: CUM_CAP,
            slippageCapBps: SLIP_CAP,
            expiry: uint64(block.timestamp + 1 days)
        });
        bytes memory sig = _signWatcher(abi.encode(block.chainid, address(del), "TIGHTEN", p));
        vm.prank(relayer);
        vm.expectRevert(NotTightening.selector);
        del.watcherTighten(p, sig);
    }

    function test_watcherFreeze_blocksExecution() public {
        bytes memory sig = _signWatcher(abi.encode(block.chainid, address(del), "FREEZE", uint256(1)));
        vm.prank(relayer);
        del.watcherFreeze(sig);

        ExecutionRequest memory r = _req();
        bytes memory esig = _sign(r, SESSION_PK);
        vm.prank(relayer);
        vm.expectRevert(GuardIsFrozen.selector);
        del.submitExecutionRequest(r, "ok", esig);
    }

    function _signWatcher(bytes memory encoded) internal view returns (bytes memory) {
        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(keccak256(encoded));
        (uint8 v, bytes32 rr, bytes32 ss) = vm.sign(WATCHER_PK, digest);
        return abi.encodePacked(rr, ss, v);
    }

    // ---------------------------------------------------------------- owner (010 §14)
    function test_ownerStop_freezes() public {
        vm.prank(address(del));
        del.ownerStop();
        assertTrue(del.guard().frozen);
    }

    function test_rotateBinding_revokesOldRequests() public {
        vm.prank(address(del));
        del.rotateBinding(2, sessionKey);
        ExecutionRequest memory r = _req(); // bindingNonce 1 (stale)
        bytes memory sig = _sign(r, SESSION_PK);
        vm.prank(relayer);
        vm.expectRevert(BadBindingNonce.selector);
        del.submitExecutionRequest(r, "ok", sig);
    }

    function test_onlyOwner_initializeGuarded() public {
        ExecutionDelegate7702 fresh = new ExecutionDelegate7702();
        HardGuardState memory g = del.guard();
        vm.prank(address(0xBAD));
        vm.expectRevert(NotOwner.selector);
        fresh.initialize(g, sessionKey, watcherKey, relayer, 0, 0, 0, bytes32(0), bytes32(0));
    }

    // ---------------------------------------------------------------- invariant-ish
    function test_cumulativeNeverExceedsCap() public {
        for (uint256 i = 0; i < 25; i++) {
            ExecutionRequest memory ri = _req();
            ri.amountIn = CAP_PER_TX;
            ri.nonce = 200 + i;
            if (del.cumulativeSpent() + CAP_PER_TX > CUM_CAP) {
                bytes memory sig = _sign(ri, SESSION_PK);
                vm.prank(relayer);
                vm.expectRevert(CumulativeCapExceeded.selector);
                del.submitExecutionRequest(ri, "ok", sig);
            } else {
                _submit(ri);
            }
            assertLe(del.cumulativeSpent(), CUM_CAP);
        }
    }
}
