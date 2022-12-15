import classes from './ProposalModalHeader.module.css';
import EthAddress from '../EthAddress';
import { ImArrowLeft2, ImArrowRight2 } from 'react-icons/im';
import { Direction, StoredProposalWithVotes } from '@nouns/prop-house-wrapper/dist/builders';
import { useCallback, useEffect } from 'react';
import VotesDisplay from '../VotesDisplay';

export interface ProposalModalHeaderProps {
  fieldTitle: string;
  address: string;
  proposalId: number;
  backButton: React.ReactNode;
  propIndex: number | undefined;
  numberOfProps: number;
  handleDirectionalArrowClick: (e: any) => void;
  isFirstProp: boolean;
  isLastProp: boolean | undefined;
  showVoteAllotmentModal: boolean;
  proposal: StoredProposalWithVotes;
}

const ProposalModalHeader: React.FC<ProposalModalHeaderProps> = props => {
  const {
    backButton,
    fieldTitle,
    address,
    proposalId,
    propIndex,
    numberOfProps,
    handleDirectionalArrowClick,
    isFirstProp,
    isLastProp,
    showVoteAllotmentModal,
    proposal
  } = props;

  const handleKeyPress = useCallback(
    event => {
      if (event.key === 'ArrowLeft' && !isFirstProp && !showVoteAllotmentModal) {
        handleDirectionalArrowClick(Direction.Down);
      }
      if (event.key === 'ArrowRight' && !isLastProp && !showVoteAllotmentModal) {
        handleDirectionalArrowClick(Direction.Up);
      }
    },
    [handleDirectionalArrowClick, isFirstProp, isLastProp, showVoteAllotmentModal],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyPress);
    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, [handleKeyPress]);

  return (
    <div className={classes.headerContainer}>
      <div className={classes.headerPropInfo}>
        {address && proposalId && (
          <div className={classes.subinfo}>
            <div className={classes.communityAndPropNumber}>
              <span className={classes.propNumber}>
                Prop {propIndex} of {numberOfProps} by
              </span>{' '}
              <div className={classes.submittedBy}>
                <EthAddress address={address} hideDavatar={true} className={classes.submittedBy} />
              </div>
              <span className={classes.creditDash}>
                —
              </span>
              <VotesDisplay proposal={proposal} />
            </div>
          </div>
        )}

        <p className={classes.propTitle}>{fieldTitle}</p>
      </div>

      <div className={classes.btnContainer}>
        <div className={classes.propNavigationButtons}>
          <button
            disabled={isFirstProp}
            onClick={() => handleDirectionalArrowClick(Direction.Down)}
          >
            <ImArrowLeft2 size={'1.5rem'} />
          </button>

          <button onClick={() => handleDirectionalArrowClick(Direction.Up)} disabled={isLastProp}>
            <ImArrowRight2 size={'1.5rem'} />
          </button>
        </div>

        {backButton && backButton}
      </div>
    </div>
  );
};

export default ProposalModalHeader;
