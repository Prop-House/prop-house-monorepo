import classes from './RoundAwardsDisplay.module.css';
import { AssetType, Round } from '@prophouse/sdk-react';
import { trophyColors } from '../../utils/trophyColors';
import { FaArrowRight, FaArrowLeft } from 'react-icons/fa';
import { useCallback, useRef } from 'react';
import LoadingIndicator from '../LoadingIndicator';
import clsx from 'clsx';
import { Swiper, SwiperRef, SwiperSlide } from 'swiper/react';
import useAssetsWithMetadata, { AssetWithMetadata } from '../../hooks/useAssetsWithMetadata';
import buildEtherscanPath from '../../utils/buildEtherscanPath';
import buildOpenSeaPath from '../../utils/buildOpenSeaPath';
import { truncateThousands } from '../../utils/truncateThousands';

const RoundAwardsDisplay: React.FC<{
  round: Round;
  slidesOffsetBefore?: number;
  slidesOffsetAfter?: number;
  breakout?: boolean;
  hidePlace?: boolean;
  showNav?: boolean;
  openLinkOnAwardsClick?: boolean;
  slidesPerView?: number;
  spaceBetween?: number;
}> = props => {
  const {
    round,
    breakout,
    hidePlace,
    slidesOffsetBefore,
    slidesOffsetAfter,
    openLinkOnAwardsClick,
    showNav,
    slidesPerView,
    spaceBetween,
  } = props;

  const sliderRef = useRef<SwiperRef>(null);
  const [loadingAssetsWithMetadata, assetsWithMetadata] = useAssetsWithMetadata(
    round.config.awards,
  );

  const renderAwardImage = (award: AssetWithMetadata, showFullImg: boolean | '' | undefined) => {
    const imgClass = clsx({ [classes.fullImg]: showFullImg });

    if (award.assetType === AssetType.ETH || !openLinkOnAwardsClick) {
      return <img src={award.tokenImg} alt="token logo" className={imgClass} />;
    }

    const { assetType, address } = award;
    const link =
      assetType === AssetType.ERC20
        ? buildEtherscanPath(address)
        : buildOpenSeaPath(address, award.tokenId.toString());
    return (
      <a href={link} target="_blank" rel="noopener noreferrer">
        <img src={award.tokenImg} alt="token logo" className={imgClass} />
      </a>
    );
  };

  const handlePrev = useCallback(() => {
    if (!sliderRef.current) return;
    sliderRef.current.swiper.slidePrev();
  }, []);

  const handleNext = useCallback(() => {
    if (!sliderRef.current) return;
    sliderRef.current.swiper.slideNext();
  }, []);

  const awardDisplay = (award: AssetWithMetadata, place: number) => {
    const erc721 = award.assetType === AssetType.ERC721;
    const erc1155 = award.assetType === AssetType.ERC1155;
    const showFullImg =
      (erc721 || erc1155) && award.tokenImg && !award.tokenImg.includes('manager');

    return (
      <div className={clsx(classes.awardDisplay)}>
        {!hidePlace && (
          <span className={classes.placeIndicator}>
            {place < 4 ? (
              <div
                style={{
                  color: `#${trophyColors(
                    place === 1 ? 'first' : place === 2 ? 'second' : 'third',
                  )}`,
                }}
              >
                {place === 1 ? '1st' : place === 2 ? '2nd' : '3rd'}
              </div>
            ) : (
              <>{place}th</>
            )}
          </span>
        )}
        {renderAwardImage(award, showFullImg)}
        {!showFullImg && (
          <div className={classes.amountAndSymbolLabel}>
            {erc721 ? (
              <>
                {award.symbol} {award.tokenId}
              </>
            ) : (
              <>
                {award.parsedAmount > 1000
                  ? truncateThousands(award.parsedAmount)
                  : award.parsedAmount}{' '}
                {award.symbol}
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  const navigation = showNav && assetsWithMetadata && assetsWithMetadata.length > 3 && (
    <div className={classes.navContainer}>
      <button
        className={classes.awardsNavControl}
        onClick={e => {
          e.stopPropagation();
          handlePrev();
        }}
      >
        <FaArrowLeft size={10} />
      </button>
      <button
        className={classes.awardsNavControl}
        onClick={e => {
          e.stopPropagation();
          handleNext();
        }}
      >
        <FaArrowRight size={10} />
      </button>
    </div>
  );

  return loadingAssetsWithMetadata ? (
    <LoadingIndicator />
  ) : assetsWithMetadata ? (
    <div className={clsx(classes.awardsAndNavigationContainer, breakout && classes.breakOut)}>
      <Swiper
        ref={sliderRef}
        slidesPerView={slidesPerView ?? 3}
        spaceBetween={spaceBetween ?? 12}
        className={classes.swiper}
        slidesOffsetBefore={slidesOffsetBefore ?? 12}
        slidesOffsetAfter={slidesOffsetAfter ?? 12}
        autoplay={{ delay: 50 }}
      >
        {assetsWithMetadata.map((asset, i) => (
          <SwiperSlide key={i} className={classes.swiperSlide}>
            {awardDisplay(asset, i + 1)}
          </SwiperSlide>
        ))}
      </Swiper>
      {showNav && assetsWithMetadata.length > 3 && navigation}
    </div>
  ) : (
    <>Error loading awards</>
  );
};
export default RoundAwardsDisplay;
