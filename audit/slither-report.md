**THIS CHECKLIST IS NOT COMPLETE**. Use `--show-ignored-findings` to show all the results.
Summary
 - [divide-before-multiply](#divide-before-multiply) (1 results) (Medium)
 - [reentrancy-no-eth](#reentrancy-no-eth) (1 results) (Medium)
 - [uninitialized-local](#uninitialized-local) (2 results) (Medium)
 - [events-access](#events-access) (1 results) (Low)
 - [reentrancy-benign](#reentrancy-benign) (2 results) (Low)
 - [reentrancy-events](#reentrancy-events) (7 results) (Low)
 - [timestamp](#timestamp) (7 results) (Low)
 - [low-level-calls](#low-level-calls) (1 results) (Informational)
 - [missing-inheritance](#missing-inheritance) (1 results) (Informational)
## divide-before-multiply
Impact: Medium
Confidence: Medium
 - [ ] ID-0
[Divinatio.claim(uint256)](contracts/Divinatio.sol#L320-L355) performs a multiplication on the result of a division:
	- [copiedProfit = (m.losingPoolNet * cp.amount) / m.pools[m.finalOutcome]](contracts/Divinatio.sol#L345)
	- [prophetFee = (copiedProfit * PROPHET_FEE_BPS) / 10_000](contracts/Divinatio.sol#L346)

contracts/Divinatio.sol#L320-L355


## reentrancy-no-eth
Impact: Medium
Confidence: Medium
 - [ ] ID-1
Reentrancy in [Divinatio.copyPredict(uint256,address,address)](contracts/Divinatio.sol#L210-L235):
	External calls:
	- [_pull(follower,amount)](contracts/Divinatio.sol#L231)
		- [(ok,ret) = address(token).call(data)](contracts/Divinatio.sol#L489)
	State variables written after the call(s):
	- [_stake(marketId,follower,outcome,amount)](contracts/Divinatio.sol#L232)
		- [stakeOf[marketId][diviner][outcome] += amount](contracts/Divinatio.sol#L442)
	[Divinatio.stakeOf](contracts/Divinatio.sol#L97) can be used in cross function reentrancies:
	- [Divinatio._stake(uint256,address,uint8,uint256)](contracts/Divinatio.sol#L434-L452)
	- [Divinatio.claim(uint256)](contracts/Divinatio.sol#L320-L355)
	- [Divinatio.copyPredict(uint256,address,address)](contracts/Divinatio.sol#L210-L235)
	- [Divinatio.stakeOf](contracts/Divinatio.sol#L97)

contracts/Divinatio.sol#L210-L235


## uninitialized-local
Impact: Medium
Confidence: Medium
 - [ ] ID-2
[Divinatio._settle(uint256,Divinatio.Market,uint8).losingPool](contracts/Divinatio.sol#L463) is a local variable never initialized

contracts/Divinatio.sol#L463


 - [ ] ID-3
[Divinatio.claim(uint256).refund](contracts/Divinatio.sol#L326) is a local variable never initialized

contracts/Divinatio.sol#L326


## events-access
Impact: Low
Confidence: Medium
 - [ ] ID-4
[Divinatio.transferOwnership(address)](contracts/Divinatio.sol#L387-L390) should emit an event for: 
	- [owner = newOwner](contracts/Divinatio.sol#L389) 

contracts/Divinatio.sol#L387-L390


## reentrancy-benign
Impact: Low
Confidence: Medium
 - [ ] ID-5
Reentrancy in [Divinatio.copyPredict(uint256,address,address)](contracts/Divinatio.sol#L210-L235):
	External calls:
	- [_pull(follower,amount)](contracts/Divinatio.sol#L231)
		- [(ok,ret) = address(token).call(data)](contracts/Divinatio.sol#L489)
	State variables written after the call(s):
	- [_stake(marketId,follower,outcome,amount)](contracts/Divinatio.sol#L232)
		- [stats.predictions += 1](contracts/Divinatio.sol#L447)
		- [stats.volume += amount](contracts/Divinatio.sol#L449)
	- [_stake(marketId,follower,outcome,amount)](contracts/Divinatio.sol#L232)
		- [hasPredicted[marketId][diviner] = true](contracts/Divinatio.sol#L446)

contracts/Divinatio.sol#L210-L235


 - [ ] ID-6
Reentrancy in [Divinatio.predict(uint256,uint8,uint256)](contracts/Divinatio.sol#L182-L185):
	External calls:
	- [_pull(msg.sender,amount)](contracts/Divinatio.sol#L183)
		- [(ok,ret) = address(token).call(data)](contracts/Divinatio.sol#L489)
	State variables written after the call(s):
	- [_stake(marketId,msg.sender,outcome,amount)](contracts/Divinatio.sol#L184)
		- [stats.predictions += 1](contracts/Divinatio.sol#L447)
		- [stats.volume += amount](contracts/Divinatio.sol#L449)
	- [_stake(marketId,msg.sender,outcome,amount)](contracts/Divinatio.sol#L184)
		- [hasPredicted[marketId][diviner] = true](contracts/Divinatio.sol#L446)
	- [_stake(marketId,msg.sender,outcome,amount)](contracts/Divinatio.sol#L184)
		- [stakeOf[marketId][diviner][outcome] += amount](contracts/Divinatio.sol#L442)

contracts/Divinatio.sol#L182-L185


## reentrancy-events
Impact: Low
Confidence: Medium
 - [ ] ID-7
Reentrancy in [Divinatio.proposeOutcome(uint256,uint8)](contracts/Divinatio.sol#L242-L256):
	External calls:
	- [_pull(msg.sender,resolutionBond)](contracts/Divinatio.sol#L249)
		- [(ok,ret) = address(token).call(data)](contracts/Divinatio.sol#L489)
	Event emitted after the call(s):
	- [OutcomeProposed(marketId,msg.sender,outcome)](contracts/Divinatio.sol#L255)

contracts/Divinatio.sol#L242-L256


 - [ ] ID-8
Reentrancy in [Divinatio.claim(uint256)](contracts/Divinatio.sol#L320-L355):
	External calls:
	- [_push(msg.sender,payout)](contracts/Divinatio.sol#L353)
		- [(ok,ret) = address(token).call(data)](contracts/Divinatio.sol#L489)
	Event emitted after the call(s):
	- [Claimed(marketId,msg.sender,payout)](contracts/Divinatio.sol#L354)

contracts/Divinatio.sol#L320-L355


 - [ ] ID-9
Reentrancy in [Divinatio.copyPredict(uint256,address,address)](contracts/Divinatio.sol#L210-L235):
	External calls:
	- [_pull(follower,amount)](contracts/Divinatio.sol#L231)
		- [(ok,ret) = address(token).call(data)](contracts/Divinatio.sol#L489)
	Event emitted after the call(s):
	- [Copied(marketId,follower,prophet,outcome,amount)](contracts/Divinatio.sol#L234)
	- [Predicted(marketId,diviner,outcome,amount)](contracts/Divinatio.sol#L451)
		- [_stake(marketId,follower,outcome,amount)](contracts/Divinatio.sol#L232)

contracts/Divinatio.sol#L210-L235


 - [ ] ID-10
Reentrancy in [Divinatio.claim(uint256)](contracts/Divinatio.sol#L320-L355):
	External calls:
	- [_push(msg.sender,refund)](contracts/Divinatio.sol#L331)
		- [(ok,ret) = address(token).call(data)](contracts/Divinatio.sol#L489)
	Event emitted after the call(s):
	- [Refunded(marketId,msg.sender,refund)](contracts/Divinatio.sol#L332)

contracts/Divinatio.sol#L320-L355


 - [ ] ID-11
Reentrancy in [Divinatio.predict(uint256,uint8,uint256)](contracts/Divinatio.sol#L182-L185):
	External calls:
	- [_pull(msg.sender,amount)](contracts/Divinatio.sol#L183)
		- [(ok,ret) = address(token).call(data)](contracts/Divinatio.sol#L489)
	Event emitted after the call(s):
	- [Predicted(marketId,diviner,outcome,amount)](contracts/Divinatio.sol#L451)
		- [_stake(marketId,msg.sender,outcome,amount)](contracts/Divinatio.sol#L184)

contracts/Divinatio.sol#L182-L185


 - [ ] ID-12
Reentrancy in [Divinatio.dispute(uint256)](contracts/Divinatio.sol#L259-L269):
	External calls:
	- [_pull(msg.sender,resolutionBond)](contracts/Divinatio.sol#L264)
		- [(ok,ret) = address(token).call(data)](contracts/Divinatio.sol#L489)
	Event emitted after the call(s):
	- [OutcomeDisputed(marketId,msg.sender)](contracts/Divinatio.sol#L268)

contracts/Divinatio.sol#L259-L269


 - [ ] ID-13
Reentrancy in [Divinatio.cancelMarket(uint256)](contracts/Divinatio.sol#L296-L311):
	External calls:
	- [_push(proposer,resolutionBond)](contracts/Divinatio.sol#L307)
		- [(ok,ret) = address(token).call(data)](contracts/Divinatio.sol#L489)
	- [_push(disputer,resolutionBond)](contracts/Divinatio.sol#L308)
		- [(ok,ret) = address(token).call(data)](contracts/Divinatio.sol#L489)
	Event emitted after the call(s):
	- [MarketCancelled(marketId)](contracts/Divinatio.sol#L310)

contracts/Divinatio.sol#L296-L311


## timestamp
Impact: Low
Confidence: Medium
 - [ ] ID-14
[Divinatio.proposeOutcome(uint256,uint8)](contracts/Divinatio.sol#L242-L256) uses timestamp for comparisons
	Dangerous comparisons:
	- [require(bool,string)(m.state == MarketState.Open,Divinatio: not awaiting resolution)](contracts/Divinatio.sol#L244)
	- [require(bool,string)(block.timestamp >= m.closeTime,Divinatio: market still open)](contracts/Divinatio.sol#L245)
	- [require(bool,string)(block.timestamp <= m.resolutionDeadline,Divinatio: resolution deadline passed)](contracts/Divinatio.sol#L246)
	- [require(bool,string)(outcome < m.outcomeCount,Divinatio: invalid outcome)](contracts/Divinatio.sol#L247)

contracts/Divinatio.sol#L242-L256


 - [ ] ID-15
[Divinatio.createMarket(string,uint8,uint64,uint64,uint16)](contracts/Divinatio.sol#L151-L176) uses timestamp for comparisons
	Dangerous comparisons:
	- [require(bool,string)(closeTime > block.timestamp,Divinatio: close time in the past)](contracts/Divinatio.sol#L160)

contracts/Divinatio.sol#L151-L176


 - [ ] ID-16
[Divinatio.finalize(uint256)](contracts/Divinatio.sol#L272-L280) uses timestamp for comparisons
	Dangerous comparisons:
	- [require(bool,string)(block.timestamp >= m.disputeWindowEnd,Divinatio: dispute window open)](contracts/Divinatio.sol#L275)

contracts/Divinatio.sol#L272-L280


 - [ ] ID-17
[Divinatio.cancelMarket(uint256)](contracts/Divinatio.sol#L296-L311) uses timestamp for comparisons
	Dangerous comparisons:
	- [require(bool,string)(block.timestamp > uint256(m.resolutionDeadline) + CANCEL_GRACE,Divinatio: too early to cancel)](contracts/Divinatio.sol#L302)

contracts/Divinatio.sol#L296-L311


 - [ ] ID-18
[Divinatio.copyPredict(uint256,address,address)](contracts/Divinatio.sol#L210-L235) uses timestamp for comparisons
	Dangerous comparisons:
	- [require(bool,string)(m.state == MarketState.Open && block.timestamp < m.closeTime,Divinatio: market not open)](contracts/Divinatio.sol#L212)

contracts/Divinatio.sol#L210-L235


 - [ ] ID-19
[Divinatio._stake(uint256,address,uint8,uint256)](contracts/Divinatio.sol#L434-L452) uses timestamp for comparisons
	Dangerous comparisons:
	- [require(bool,string)(block.timestamp < m.closeTime,Divinatio: predictions closed)](contracts/Divinatio.sol#L437)

contracts/Divinatio.sol#L434-L452


 - [ ] ID-20
[Divinatio.dispute(uint256)](contracts/Divinatio.sol#L259-L269) uses timestamp for comparisons
	Dangerous comparisons:
	- [require(bool,string)(block.timestamp < m.disputeWindowEnd,Divinatio: dispute window closed)](contracts/Divinatio.sol#L262)

contracts/Divinatio.sol#L259-L269


## low-level-calls
Impact: Informational
Confidence: High
 - [ ] ID-21
Low level call in [Divinatio._callToken(bytes)](contracts/Divinatio.sol#L488-L491):
	- [(ok,ret) = address(token).call(data)](contracts/Divinatio.sol#L489)

contracts/Divinatio.sol#L488-L491


## missing-inheritance
Impact: Informational
Confidence: High
 - [ ] ID-22
[MockStablecoin](contracts/MockStablecoin.sol#L7-L53) should inherit from [IERC20](contracts/Divinatio.sol#L4-L7)

contracts/MockStablecoin.sol#L7-L53


