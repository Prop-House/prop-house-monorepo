import classes from './VotesPerAddress.module.css';
import React from 'react';
import Button, { ButtonColor } from '../../Button';
import Group from '../Group';
import { NewVoter } from '../VotersConfig';
import Text from '../Text';
import { AssetType, VotingStrategyType } from '@prophouse/sdk-react';

const VotesPerAddress: React.FC<{
  voter: NewVoter;
  handleVote: (votes: number) => void;
  disabled: boolean;
}> = props => {
  const { voter, handleVote, disabled } = props;

  const handleIncrement = () => handleVote(voter.multiplier + 1);
  const handleDecrement = () => handleVote(voter.multiplier - 1);

  const handleVoteInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = parseInt(e.target.value);
    // If value is NaN or negative, set to 1
    if (isNaN(value) || value < 1) value = 1;

    // If the value is greater than 3 digits, truncate it to first 3 digits
    // ie. 1234 -> 123
    if (value.toString().length > 3) value = Number(value.toString().substring(0, 3));

    handleVote(value);
  };

  const handleInputPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const clipboardData = e.clipboardData.getData('text');
    const value = parseInt(clipboardData, 10);
    if (isNaN(value) || value < 1) {
      // If value is NaN or negative, prevent paste
      e.preventDefault();
      return;
    }
  };

  return (
    <Group mt={8} gap={4}>
      <Text type="subtitle">
        {voter.type === VotingStrategyType.ALLOWLIST ? 'Votes per user' : 'Votes per token'}
      </Text>
      <Text type="body">{`Choose how many votes are allotted for each ${
        voter.type === VotingStrategyType.ALLOWLIST ? 'user' : `${AssetType[voter.asset]} held`
      }.`}</Text>

      <Group row gap={16} classNames={classes.voteContainer}>
        <input
          maxLength={3}
          className={classes.votesInput}
          disabled={disabled}
          value={disabled ? '' : voter.multiplier}
          placeholder="1"
          type="number"
          onChange={handleVoteInputChange}
          onPaste={handleInputPaste}
        />
        <div className={classes.allotButtons}>
          <Button
            text="-"
            classNames={classes.button}
            bgColor={ButtonColor.Gray}
            onClick={handleDecrement}
            disabled={voter.multiplier === 1 || disabled}
          />
          <Button
            text="+"
            disabled={disabled}
            classNames={classes.button}
            bgColor={ButtonColor.Gray}
            onClick={handleIncrement}
          />
        </div>
      </Group>
    </Group>
  );
};

export default VotesPerAddress;
