import type { Preview } from '@storybook/react';
import '../app/globals.css';

const preview: Preview = {
  parameters: {
    actions: { argTypesRegex: '^on[A-Z].*' },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: 'obsidianDark',
      values: [
        { name: 'obsidianDark', value: '#09090b' },
        { name: 'cleanSlateLight', value: '#f8fafc' },
      ],
    },
  },
};

export default preview;

