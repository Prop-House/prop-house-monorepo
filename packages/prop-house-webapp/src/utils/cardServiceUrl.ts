export enum CardType {
  proposal = 'proposal',
  round = 'round',
  house = 'house',
}
/**
 * General URL that consumes card-render service to generate opengraph metadata
 */
export const cardServiceUrl = (cardtype: CardType, address: string, id?: string): URL => {
  return new URL(`https://prop.house/${cardtype}/${address}${id ? `/${id}` : ''}/card`);
  // const base =
  //   process.env.REACT_APP_NODE_ENV === 'production' && process.env.REACT_APP_PROD_CARD_SERVICE_URI
  //     ? process.env.REACT_APP_PROD_CARD_SERVICE_URI
  //     : process.env.REACT_APP_NODE_ENV === 'development' &&
  //       process.env.REACT_APP_DEV_CARD_SERVICE_URI
  //     ? process.env.REACT_APP_DEV_CARD_SERVICE_URI
  //     : 'http://localhost:3002';
  // return new URL(`${cardtype}/${address}${id ? `/${id}` : ''}/card`, base);
};
