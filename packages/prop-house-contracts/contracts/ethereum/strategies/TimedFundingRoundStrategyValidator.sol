// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.13;

import { IStrategyValidator } from './interfaces/IStrategyValidator.sol';
import { IFundingHouse } from '../houses/interfaces/IFundingHouse.sol';
import { Uint256Utils } from '../utils/Uint256Utils.sol';

contract TimedFundingRoundStrategyValidator is IStrategyValidator {
    using { Uint256Utils.split } for uint256;
    using { Uint256Utils.toUint256 } for address;

    /// @notice Thrown when the proposal period start timestamp is not far enough in the future
    error ProposalPeriodStartTimestampTooSoon();

    /// @notice Thrown when the proposal period duration is too short
    error ProposalPeriodDurationTooShort();

    /// @notice Thrown when the vote period duration is too short
    error VotePeriodDurationTooShort();

    /// @notice Thrown when the award length is invalid
    error InvalidAwardLength();

    /// @notice Thrown when the award amount is invalid
    error InvalidAwardAmount();

    /// @notice Thrown when the winner count is zero
    error WinnerCountMustBeGreaterThanZero();

    /// @notice Thrown when the winner count is greater than the maximum allowable count
    error WinnerCountTooHigh();

    /// @notice The minimum time required between round initiation and the start of the proposal period
    uint256 public constant MIN_TIME_UNTIL_PROPOSAL_PERIOD = 2 hours;

    /// @notice The minimum proposal submission period duration
    uint256 public constant MIN_PROPOSAL_PERIOD_DURATION = 4 hours;

    /// @notice The minimum vote period duration
    uint256 public constant MIN_VOTE_PERIOD_DURATION = 4 hours;

    /// @notice Maximum winner count for this strategy
    uint256 public constant MAX_WINNER_COUNT = 256;

    /// @notice The hash of the house strategy on Starknet
    uint256 public immutable classHash;

    /// @notice The timed funding round house strategy params
    struct TimedFundingRound {
        uint40 proposalPeriodStartTimestamp;
        uint40 proposalPeriodDuration;
        uint40 votePeriodDuration;
        uint16 winnerCount;
    }

    constructor(uint256 _classHash) {
        classHash = _classHash;
    }

    /// @notice Validate the timed funding round strategy `data` and return the L2 strategy class hash and params.
    /// This strategy supports two award strategies - A single award that's split equally between winners OR an
    /// array of awards equal in length to the number of winners, which can include varying assets and amounts.
    /// @param data The timed funding round config
    function getStrategyParams(bytes calldata data) external view returns (uint256[] memory params) {
        (address initiator, uint256 roundId, bytes32 awardHash, bytes memory config, IFundingHouse.Award[] memory awards) = abi.decode(
            data,
            (address, uint256, bytes32, bytes, IFundingHouse.Award[])
        );

        TimedFundingRound memory round = abi.decode(config, (TimedFundingRound));

        if (round.proposalPeriodStartTimestamp - MIN_TIME_UNTIL_PROPOSAL_PERIOD < block.timestamp) {
            revert ProposalPeriodStartTimestampTooSoon();
        }
        if (round.proposalPeriodDuration < MIN_PROPOSAL_PERIOD_DURATION) {
            revert ProposalPeriodDurationTooShort();
        }
        if (round.votePeriodDuration < MIN_VOTE_PERIOD_DURATION) {
            revert VotePeriodDurationTooShort();
        }
        if (awards.length != 1 && awards.length != round.winnerCount) {
            revert InvalidAwardLength();
        }
        if (awards.length == 1 && round.winnerCount > 1 && awards[0].amount % round.winnerCount != 0) {
            revert InvalidAwardAmount();
        }
        if (round.winnerCount == 0) {
            revert WinnerCountMustBeGreaterThanZero();
        }
        if (round.winnerCount > MAX_WINNER_COUNT) {
            revert WinnerCountTooHigh();
        }

        params = new uint256[](11);
        params[0] = msg.sender.toUint256();
        params[1] = classHash;
        params[2] = 8; // Strategy Params Length
        params[3] = roundId;
        params[4] = initiator.toUint256();
        (params[5], params[6]) = uint256(awardHash).split();
        params[7] = round.proposalPeriodStartTimestamp;
        params[8] = round.proposalPeriodDuration;
        params[9] = round.votePeriodDuration;
        params[10] = round.winnerCount;

        return params;
    }
}
