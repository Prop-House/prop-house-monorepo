import { useEffect, useState } from 'react';
import { Round, usePropHouse } from '@prophouse/sdk-react';

export type UseCanProposeResults = [
  /**
   * loadingCanPropose
   */
  boolean,
  /**
   * errorLoadingCanPropose
   */
  boolean,
  /**
   * canPropose
   */
  boolean | undefined | null,
];

const useCanPropose = (
  round: Round | undefined,
  account: `0x${string}` | undefined,
): UseCanProposeResults => {
  const [loadingCanPropose, setLoadingCanPropose] = useState(false);
  const [errorLoadingCanPropose, setErrorLoadingCanPropose] = useState(false);
  const [canPropose, setCanPropose] = useState<null | boolean>(null);

  const propHouse = usePropHouse();

  useEffect(() => {
    const fetchCanPropose = async () => {
      if (!round || !account) return;

      setLoadingCanPropose(true);
      try {
        const { canPropose } = await propHouse.round.timed.getProposeEligibility(
          round.address,
          account,
        );
        setCanPropose(canPropose);
        setLoadingCanPropose(false);
      } catch (e) {
        console.log('Error fetching canPropose: ', e);
        setLoadingCanPropose(false);
        setErrorLoadingCanPropose(true);
      }
    };
    fetchCanPropose();
  }, [round, account, propHouse.round.timed]);

  return [loadingCanPropose, errorLoadingCanPropose, canPropose];
};

export default useCanPropose;
