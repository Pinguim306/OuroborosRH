// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Launchpad} from "src/Launchpad.sol";
import {FeeLocker} from "src/FeeLocker.sol";
import {OuroToken} from "src/OuroToken.sol";
import {MockDexRouter, MockDexFactory, MockWETH} from "./mocks/MockDex.sol";
import {MockWETH9, MockV3Factory, MockPositionManager, MockSwapRouter02} from "./mocks/MockV3.sol";

/// @notice FeeLocker: permissionless fee harvesting with the protocol/holder split,
///         and no way to touch the principal.
contract FeeLockerTest is Test {
    Launchpad internal launchpad;
    FeeLocker internal locker;
    MockWETH9 internal weth;
    MockPositionManager internal npm;
    OuroToken internal token;
    uint256 internal positionId = 1;

    address internal dev = address(0xDE0);
    address internal cranker = address(0xC4A2);

    uint256 internal constant CREATION_FEE = 0.01 ether;
    uint256 internal constant HOLDER_SHARE_BPS = 4000; // 40%

    function setUp() public {
        weth = new MockWETH9();
        MockV3Factory v3factory = new MockV3Factory();
        npm = new MockPositionManager(address(v3factory), address(weth));

        Launchpad.CurveParams memory p = Launchpad.CurveParams({
            totalSupply: 1_000_000_000 ether,
            virtualNative: 1 ether,
            devFeeBps: 50,
            liqFeeBps: 60,
            holderFeeBps: 40,
            graduationTarget: 4 ether,
            maxBuyBps: 0,
            postGradTaxBps: 100
        });
        MockDexRouter v2router = new MockDexRouter(address(new MockDexFactory()), address(new MockWETH()));
        launchpad = new Launchpad(address(this), dev, address(v2router), CREATION_FEE, p);
        launchpad.setV3Config(
            address(npm),
            address(new MockSwapRouter02()),
            HOLDER_SHARE_BPS,
            Launchpad.V3Params({
                feeTier: 10000,
                sqrtPriceX96Token0: 2505414483750479311864138,
                sqrtPriceX96Token1: 2505414483750479311864138015696063,
                tickLower0: -207200,
                tickUpper0: 887200,
                tickLower1: -887200,
                tickUpper1: 207200
            })
        );
        locker = launchpad.feeLocker();

        (address tk,) = launchpad.createTokenV3{value: CREATION_FEE}("Viper", "VPR", "", 0);
        token = OuroToken(payable(tk));

        // Fund the mock NPM with WETH so it can pay out the ETH side of a collect.
        weth.deposit{value: 10 ether}();
        weth.transfer(address(npm), 10 ether);
    }

    function testCollectSplitsEthSide() public {
        // 1 ETH of WETH-side fees + 500 tokens of token-side fees are pending.
        (, bool tokenIs0) = locker.positions(positionId);
        if (tokenIs0) npm.setPendingFees(500 ether, 1 ether);
        else npm.setPendingFees(1 ether, 500 ether);

        uint256 devEthBefore = dev.balance;
        uint256 devTokBefore = token.balanceOf(dev);
        uint256 distributedBefore = token.totalRewardsDistributed() + token.pendingRewards();

        vm.prank(cranker); // anyone can crank
        (uint256 ethSide, uint256 tokenSide) = locker.collect(positionId);

        assertEq(ethSide, 1 ether);
        assertEq(tokenSide, 500 ether);
        // 40% of the ETH side streamed into the token for holders...
        uint256 distributedAfter = token.totalRewardsDistributed() + token.pendingRewards();
        assertEq(distributedAfter - distributedBefore, 0.4 ether);
        // ...60% to the protocol, plus the whole token side.
        assertEq(dev.balance - devEthBefore, 0.6 ether);
        assertEq(token.balanceOf(dev) - devTokBefore, 500 ether);
        // Nothing sticks to the locker.
        assertEq(address(locker).balance, 0);
        assertEq(token.balanceOf(address(locker)), 0);
    }

    function testCollectFollowsLiveFeeRecipient() public {
        // The protocol share follows launchpad.feeRecipient() at collect time.
        address newVault = address(0xBEEF);
        launchpad.setFeeRecipient(newVault);
        (, bool tokenIs0) = locker.positions(positionId);
        if (tokenIs0) npm.setPendingFees(0, 1 ether);
        else npm.setPendingFees(1 ether, 0);

        locker.collect(positionId);
        assertEq(newVault.balance, 0.6 ether);
    }

    function testCollectUnknownPositionReverts() public {
        vm.expectRevert(FeeLocker.UnknownPosition.selector);
        locker.collect(999);
    }

    function testRegisterOnlyLaunchpad() public {
        vm.prank(cranker);
        vm.expectRevert(FeeLocker.NotLaunchpad.selector);
        locker.register(2, address(token), true);
    }
}
