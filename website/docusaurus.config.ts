import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import { themes as prismThemes } from 'prism-react-renderer';

const config: Config = {
  title: 'whatsweb',
  tagline: 'WhatsApp Web SDK with no browser',

  url: 'https://pablofdezr.github.io',
  baseUrl: '/whatsweb/docs/',

  organizationName: 'pablofdezr',
  projectName: 'whatsweb',

  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          routeBasePath: '/',
          sidebarPath: './sidebars.js',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  plugins: [
    [
      'docusaurus-plugin-typedoc',
      {
        entryPoints: ['../src/index.ts'],
        tsconfig: '../tsconfig.json',
        out: 'docs',
        excludePrivate: true,
        excludeInternal: true,
        // Do not document members inherited from external declarations
        // (e.g. Node's EventEmitter, Baileys types). Their upstream JSDoc
        // contains inline `{Foo}` tags that MDX v3 parses as JS expressions.
        excludeExternals: true,
        // Skip merging the SDK README as the index page; its relative links
        // (CHANGELOG.md, CONTRIBUTING.md, ...) would emit broken-link warnings.
        // A clean generated API index is used as the site root instead.
        readme: 'none',
      },
    ],
  ],

  themeConfig: {
    navbar: {
      title: 'whatsweb',
      items: [
        {
          href: 'https://pablofdezr.github.io/whatsweb/',
          label: 'Home',
          position: 'left',
        },
        {
          href: 'https://github.com/pablofdezr/whatsweb',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      copyright: 'MIT © Pablo Fernández Ruiz',
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
    colorMode: {
      respectPrefersColorScheme: true,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
