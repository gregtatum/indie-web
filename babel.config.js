export default {
  targets: '>5%',
  presets: [
    '@babel/preset-env',
    '@babel/preset-typescript',
    '@babel/preset-react',
  ],
  plugins: [
    [
      'module-resolver',
      {
        root: ['.'],
        alias: {
          // Keep up to date with tsconfig.json
          frontend: './src/frontend',
          shared: './src/shared',
          server: './src/server',
        },
      },
    ],
  ],
};
