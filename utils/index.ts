export * from './verify';
export * from './signatures';

export const delay =(ms: number) => {
  return new Promise( resolve => setTimeout(resolve, ms) );
};
