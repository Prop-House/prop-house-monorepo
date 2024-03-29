import { CodegenConfig } from '@graphql-codegen/cli';

export const getCodegenConfig = (
  schema: string,
  documents: string[],
  subfolder: string,
): CodegenConfig => ({
  schema,
  documents,
  generates: {
    [`./src/gql/${subfolder}/`]: {
      preset: 'client',
      presetConfig: {
        fragmentMasking: false,
      },
    },
  },
  hooks: { afterAllFileWrite: ['prettier --write'] },
});
