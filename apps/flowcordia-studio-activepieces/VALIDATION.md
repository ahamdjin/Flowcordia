# Studio V2 Activepieces Validation

Exact validation of the Flowcordia adapter around the vendored Activepieces frontend.

| Check | Result |
| --- | --- |
| Adapter formatting | FAIL (1) |

## Adapter formatting failure

```text
Checking formatting...

apps/flowcordia-studio-activepieces/activepieces-tsconfig.base.json (9ms)
apps/flowcordia-studio-activepieces/scripts/copy-to-webapp.mjs (0ms)
apps/flowcordia-studio-activepieces/scripts/run-with-activepieces-tsconfig.mjs (0ms)
apps/flowcordia-studio-activepieces/src/flowcordia-activepieces-bridge.ts (8ms)
apps/flowcordia-studio-activepieces/src/studio-host.css (224ms)
apps/flowcordia-studio-activepieces/src/studio-host.tsx (1ms)
apps/flowcordia-studio-activepieces/tsconfig.bridge.json (0ms)
apps/flowcordia-studio-activepieces/tsconfig.json (0ms)
apps/flowcordia-studio-activepieces/vite.config.mts (0ms)
apps/webapp/app/features/flowcordia/workflows/studio-v2/StudioV2ActivepiecesHost.tsx (0ms)
apps/webapp/test/flowcordia/studioV2PreviewRoute.test.ts (0ms)

Format issues found in above 11 files. Run without `--check` to fix.
Finished in 254ms on 16 files using 4 threads.

```
| Adapter typecheck | PASS |
| Adapter tests | PASS |
| Adapter production build | FAIL (1) |

## Adapter production build failure

```text

> @flowcordia/studio-activepieces@0.1.0 build /home/runner/work/Flowcordia/Flowcordia/apps/flowcordia-studio-activepieces
> node scripts/run-with-activepieces-tsconfig.mjs vite build --config vite.config.mts

[36mvite v6.4.3 [32mbuilding for production...[36m[39m
transforming...
[32m✓[39m 6 modules transformed.
[31m✗[39m Build failed in 90ms
[31merror during build:
[31m[vite:load-fallback] Could not load /home/runner/work/Flowcordia/Flowcordia/studio-v2/activepieces-web/src/index.css (imported by src/main.tsx): ENOENT: no such file or directory, open '/home/runner/work/Flowcordia/Flowcordia/studio-v2/activepieces-web/src/index.css'[31m
    at async open (node:internal/fs/promises:637:25)
    at async Object.readFile (node:internal/fs/promises:1249:14)
    at async Object.handler (file:///home/runner/work/Flowcordia/Flowcordia/node_modules/.pnpm/vite@6.4.3_@types+node@20.14.14_jiti@2.6.1_lightningcss@1.30.2_terser@5.46.1_tsx@4.22.4_yaml@2.9.0/node_modules/vite/dist/node/chunks/dep-Dm0c1Wj2.js:46002:27)
    at async PluginDriver.hookFirstAndGetPlugin (file:///home/runner/work/Flowcordia/Flowcordia/node_modules/.pnpm/rollup@4.60.1/node_modules/rollup/dist/es/shared/node-entry.js:22849:28)
    at async file:///home/runner/work/Flowcordia/Flowcordia/node_modules/.pnpm/rollup@4.60.1/node_modules/rollup/dist/es/shared/node-entry.js:21833:33
    at async Queue.work (file:///home/runner/work/Flowcordia/Flowcordia/node_modules/.pnpm/rollup@4.60.1/node_modules/rollup/dist/es/shared/node-entry.js:23077:32)[39m
/home/runner/work/Flowcordia/Flowcordia/apps/flowcordia-studio-activepieces:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @flowcordia/studio-activepieces@0.1.0 build: `node scripts/run-with-activepieces-tsconfig.mjs vite build --config vite.config.mts`
Exit status 1

```
| Webapp typecheck | FAIL (2) |

## Webapp typecheck failure

```text
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<HTMLAttributes<HTMLParagraphElement>, HTMLParagraphElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/deployment-failure.tsx(100,14): error TS2786: 'CodeBlock' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<CodeBlockProps & RefAttributes<HTMLPreElement>>' is not a valid JSX element type.
../../internal-packages/emails/emails/deployment-failure.tsx(103,12): error TS2786: 'Link' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<AnchorHTMLAttributes<HTMLAnchorElement>, HTMLAnchorElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/deployment-failure.tsx(117,16): error TS2786: 'Row' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<TableHTMLAttributes<HTMLTableElement>, HTMLTableElement>, "ref"> & { ...; }> & RefAttributes<...>>' is not a valid JSX element type.
    Type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<TableHTMLAttributes<HTMLTableElement>, HTMLTableElement>, "ref"> & { ...; }> & RefAttributes<...>>' is not assignable to type '(props: any, deprecatedLegacyContext?: any) => ReactNode'.
      Type 'import("/home/runner/work/Flowcordia/Flowcordia/node_modules/.pnpm/@types+react@19.2.14/node_modules/@types/react/index").ReactNode' is not assignable to type 'React.ReactNode'.
../../internal-packages/emails/emails/deployment-failure.tsx(118,18): error TS2786: 'Column' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<TdHTMLAttributes<HTMLTableDataCellElement>, HTMLTableDataCellElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
    Type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<TdHTMLAttributes<HTMLTableDataCellElement>, HTMLTableDataCellElement>, "ref">> & RefAttributes<...>>' is not assignable to type '(props: any, deprecatedLegacyContext?: any) => ReactNode'.
      Type 'import("/home/runner/work/Flowcordia/Flowcordia/node_modules/.pnpm/@types+react@19.2.14/node_modules/@types/react/index").ReactNode' is not assignable to type 'React.ReactNode'.
../../internal-packages/emails/emails/deployment-failure.tsx(119,18): error TS2786: 'Column' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<TdHTMLAttributes<HTMLTableDataCellElement>, HTMLTableDataCellElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/deployment-failure.tsx(120,20): error TS2786: 'Link' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<AnchorHTMLAttributes<HTMLAnchorElement>, HTMLAnchorElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/deployment-failure.tsx(125,16): error TS2786: 'Row' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<TableHTMLAttributes<HTMLTableElement>, HTMLTableElement>, "ref"> & { ...; }> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/deployment-failure.tsx(126,18): error TS2786: 'Column' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<TdHTMLAttributes<HTMLTableDataCellElement>, HTMLTableDataCellElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/deployment-failure.tsx(127,18): error TS2786: 'Column' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<TdHTMLAttributes<HTMLTableDataCellElement>, HTMLTableDataCellElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/deployment-failure.tsx(128,20): error TS2786: 'Link' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<AnchorHTMLAttributes<HTMLAnchorElement>, HTMLAnchorElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/deployment-failure.tsx(135,18): error TS2786: 'Row' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<TableHTMLAttributes<HTMLTableElement>, HTMLTableElement>, "ref"> & { ...; }> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/deployment-failure.tsx(136,20): error TS2786: 'Column' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<TdHTMLAttributes<HTMLTableDataCellElement>, HTMLTableDataCellElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/deployment-failure.tsx(137,20): error TS2786: 'Column' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<TdHTMLAttributes<HTMLTableDataCellElement>, HTMLTableDataCellElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/deployment-failure.tsx(138,22): error TS2786: 'Link' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<AnchorHTMLAttributes<HTMLAnchorElement>, HTMLAnchorElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/deployment-failure.tsx(148,14): error TS2786: 'Row' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<TableHTMLAttributes<HTMLTableElement>, HTMLTableElement>, "ref"> & { ...; }> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/deployment-failure.tsx(149,16): error TS2786: 'Column' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<TdHTMLAttributes<HTMLTableDataCellElement>, HTMLTableDataCellElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/deployment-failure.tsx(150,16): error TS2786: 'Column' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<TdHTMLAttributes<HTMLTableDataCellElement>, HTMLTableDataCellElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/deployment-failure.tsx(151,18): error TS2786: 'Link' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<AnchorHTMLAttributes<HTMLAnchorElement>, HTMLAnchorElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/deployment-success.tsx(79,6): error TS2786: 'Html' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<HtmlHTMLAttributes<HTMLHtmlElement>, HTMLHtmlElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/deployment-success.tsx(80,8): error TS2786: 'Head' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<HTMLAttributes<HTMLHeadElement>, HTMLHeadElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/deployment-success.tsx(81,8): error TS2786: 'Preview' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement>, "ref"> & { ...; }> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/deployment-success.tsx(82,8): error TS2786: 'Body' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<HtmlHTMLAttributes<HTMLBodyElement>> & RefAttributes<HTMLBodyElement>>' is not a valid JSX element type.
../../internal-packages/emails/emails/deployment-success.tsx(83,10): error TS2786: 'Container' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<TableHTMLAttributes<HTMLTableElement>, HTMLTableElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/deployment-success.tsx(84,12): error TS2786: 'Text' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<HTMLAttributes<HTMLParagraphElement>, HTMLParagraphElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/deployment-success.tsx(88,12): error TS2786: 'Link' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<AnchorHTMLAttributes<HTMLAnchorElement>, HTMLAnchorElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/deployment-success.tsx(102,16): error TS2786: 'Row' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<TableHTMLAttributes<HTMLTableElement>, HTMLTableElement>, "ref"> & { ...; }> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/deployment-success.tsx(103,18): error TS2786: 'Column' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<TdHTMLAttributes<HTMLTableDataCellElement>, HTMLTableDataCellElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/deployment-success.tsx(104,18): error TS2786: 'Column' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<TdHTMLAttributes<HTMLTableDataCellElement>, HTMLTableDataCellElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/deployment-success.tsx(105,20): error TS2786: 'Link' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<AnchorHTMLAttributes<HTMLAnchorElement>, HTMLAnchorElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/deployment-success.tsx(110,16): error TS2786: 'Row' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<TableHTMLAttributes<HTMLTableElement>, HTMLTableElement>, "ref"> & { ...; }> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/deployment-success.tsx(111,18): error TS2786: 'Column' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<TdHTMLAttributes<HTMLTableDataCellElement>, HTMLTableDataCellElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/deployment-success.tsx(112,18): error TS2786: 'Column' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<TdHTMLAttributes<HTMLTableDataCellElement>, HTMLTableDataCellElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/deployment-success.tsx(113,20): error TS2786: 'Link' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<AnchorHTMLAttributes<HTMLAnchorElement>, HTMLAnchorElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/deployment-success.tsx(120,18): error TS2786: 'Row' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<TableHTMLAttributes<HTMLTableElement>, HTMLTableElement>, "ref"> & { ...; }> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/deployment-success.tsx(121,20): error TS2786: 'Column' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<TdHTMLAttributes<HTMLTableDataCellElement>, HTMLTableDataCellElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/deployment-success.tsx(122,20): error TS2786: 'Column' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<TdHTMLAttributes<HTMLTableDataCellElement>, HTMLTableDataCellElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/deployment-success.tsx(123,22): error TS2786: 'Link' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<AnchorHTMLAttributes<HTMLAnchorElement>, HTMLAnchorElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/deployment-success.tsx(133,14): error TS2786: 'Row' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<TableHTMLAttributes<HTMLTableElement>, HTMLTableElement>, "ref"> & { ...; }> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/deployment-success.tsx(134,16): error TS2786: 'Column' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<TdHTMLAttributes<HTMLTableDataCellElement>, HTMLTableDataCellElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/deployment-success.tsx(135,16): error TS2786: 'Column' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<TdHTMLAttributes<HTMLTableDataCellElement>, HTMLTableDataCellElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/deployment-success.tsx(136,18): error TS2786: 'Link' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<AnchorHTMLAttributes<HTMLAnchorElement>, HTMLAnchorElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/invite.tsx(22,6): error TS2786: 'Html' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<HtmlHTMLAttributes<HTMLHtmlElement>, HTMLHtmlElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/invite.tsx(23,8): error TS2786: 'Head' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<HTMLAttributes<HTMLHeadElement>, HTMLHeadElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/invite.tsx(24,8): error TS2786: 'Preview' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement>, "ref"> & { ...; }> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/invite.tsx(25,8): error TS2786: 'Body' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<HtmlHTMLAttributes<HTMLBodyElement>> & RefAttributes<HTMLBodyElement>>' is not a valid JSX element type.
../../internal-packages/emails/emails/invite.tsx(26,10): error TS2786: 'Container' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<TableHTMLAttributes<HTMLTableElement>, HTMLTableElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/invite.tsx(27,12): error TS2786: 'Text' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<HTMLAttributes<HTMLParagraphElement>, HTMLParagraphElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/invite.tsx(28,12): error TS2786: 'Text' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<HTMLAttributes<HTMLParagraphElement>, HTMLParagraphElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/invite.tsx(31,12): error TS2786: 'Link' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<AnchorHTMLAttributes<HTMLAnchorElement>, HTMLAnchorElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/magic-link.tsx(8,6): error TS2786: 'Html' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<HtmlHTMLAttributes<HTMLHtmlElement>, HTMLHtmlElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/magic-link.tsx(9,8): error TS2786: 'Head' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<HTMLAttributes<HTMLHeadElement>, HTMLHeadElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/magic-link.tsx(10,8): error TS2786: 'Preview' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement>, "ref"> & { ...; }> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/magic-link.tsx(11,8): error TS2786: 'Body' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<HtmlHTMLAttributes<HTMLBodyElement>> & RefAttributes<HTMLBodyElement>>' is not a valid JSX element type.
../../internal-packages/emails/emails/magic-link.tsx(12,10): error TS2786: 'Container' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<TableHTMLAttributes<HTMLTableElement>, HTMLTableElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/magic-link.tsx(13,12): error TS2786: 'Text' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<HTMLAttributes<HTMLParagraphElement>, HTMLParagraphElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/magic-link.tsx(14,12): error TS2786: 'Link' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<AnchorHTMLAttributes<HTMLAnchorElement>, HTMLAnchorElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/magic-link.tsx(24,12): error TS2786: 'Text' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<HTMLAttributes<HTMLParagraphElement>, HTMLParagraphElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/mfa-disabled.tsx(26,6): error TS2786: 'Html' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<HtmlHTMLAttributes<HTMLHtmlElement>, HTMLHtmlElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/mfa-disabled.tsx(27,8): error TS2786: 'Head' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<HTMLAttributes<HTMLHeadElement>, HTMLHeadElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/mfa-disabled.tsx(28,8): error TS2786: 'Preview' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement>, "ref"> & { ...; }> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/mfa-disabled.tsx(29,8): error TS2786: 'Body' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<HtmlHTMLAttributes<HTMLBodyElement>> & RefAttributes<HTMLBodyElement>>' is not a valid JSX element type.
../../internal-packages/emails/emails/mfa-disabled.tsx(30,10): error TS2786: 'Container' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<TableHTMLAttributes<HTMLTableElement>, HTMLTableElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/mfa-disabled.tsx(31,12): error TS2786: 'Text' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<HTMLAttributes<HTMLParagraphElement>, HTMLParagraphElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/mfa-disabled.tsx(32,12): error TS2786: 'Text' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<HTMLAttributes<HTMLParagraphElement>, HTMLParagraphElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/mfa-disabled.tsx(33,12): error TS2786: 'Text' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<HTMLAttributes<HTMLParagraphElement>, HTMLParagraphElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/mfa-disabled.tsx(38,12): error TS2786: 'Text' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<HTMLAttributes<HTMLParagraphElement>, HTMLParagraphElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/mfa-enabled.tsx(26,6): error TS2786: 'Html' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<HtmlHTMLAttributes<HTMLHtmlElement>, HTMLHtmlElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/mfa-enabled.tsx(27,8): error TS2786: 'Head' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<HTMLAttributes<HTMLHeadElement>, HTMLHeadElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/mfa-enabled.tsx(28,8): error TS2786: 'Preview' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement>, "ref"> & { ...; }> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/mfa-enabled.tsx(29,8): error TS2786: 'Body' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<HtmlHTMLAttributes<HTMLBodyElement>> & RefAttributes<HTMLBodyElement>>' is not a valid JSX element type.
../../internal-packages/emails/emails/mfa-enabled.tsx(30,10): error TS2786: 'Container' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<TableHTMLAttributes<HTMLTableElement>, HTMLTableElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/mfa-enabled.tsx(31,12): error TS2786: 'Text' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<HTMLAttributes<HTMLParagraphElement>, HTMLParagraphElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/mfa-enabled.tsx(32,12): error TS2786: 'Text' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<HTMLAttributes<HTMLParagraphElement>, HTMLParagraphElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/mfa-enabled.tsx(33,12): error TS2786: 'Text' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<HTMLAttributes<HTMLParagraphElement>, HTMLParagraphElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/mfa-enabled.tsx(37,12): error TS2786: 'Text' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<HTMLAttributes<HTMLParagraphElement>, HTMLParagraphElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/mfa-enabled.tsx(40,12): error TS2786: 'Text' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<HTMLAttributes<HTMLParagraphElement>, HTMLParagraphElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/emails/emails/mfa-enabled.tsx(45,12): error TS2786: 'Text' cannot be used as a JSX component.
  Its type 'ForwardRefExoticComponent<Readonly<Omit<DetailedHTMLProps<HTMLAttributes<HTMLParagraphElement>, HTMLParagraphElement>, "ref">> & RefAttributes<...>>' is not a valid JSX element type.
../../internal-packages/llm-model-catalog/src/registry.ts(1,56): error TS2307: Cannot find module '@trigger.dev/database' or its corresponding type declarations.
../../internal-packages/llm-model-catalog/src/registry.ts(63,75): error TS7006: Parameter 'tier' implicitly has an 'any' type.
../../internal-packages/llm-model-catalog/src/registry.ts(69,36): error TS7006: Parameter 'p' implicitly has an 'any' type.
../../internal-packages/llm-model-catalog/src/seed.ts(1,35): error TS2307: Cannot find module '@trigger.dev/database' or its corresponding type declarations.
../../internal-packages/llm-model-catalog/src/seed.ts(2,36): error TS2307: Cannot find module '@trigger.dev/core/v3/isomorphic' or its corresponding type declarations.
../../internal-packages/llm-model-catalog/src/seed.ts(33,38): error TS7006: Parameter 'tx' implicitly has an 'any' type.
../../internal-packages/llm-model-catalog/src/sync.ts(1,43): error TS2307: Cannot find module '@trigger.dev/database' or its corresponding type declarations.
../../internal-packages/llm-model-catalog/src/sync.ts(55,54): error TS7006: Parameter 'tx' implicitly has an 'any' type.
../../internal-packages/llm-model-catalog/src/types.ts(1,30): error TS2307: Cannot find module '@trigger.dev/database' or its corresponding type declarations.
../../internal-packages/redis/src/index.ts(2,24): error TS2307: Cannot find module '@trigger.dev/core/logger' or its corresponding type declarations.
../../internal-packages/testcontainers/src/utils.ts(4,26): error TS2307: Cannot find module '@trigger.dev/core' or its corresponding type declarations.
../../internal-packages/testcontainers/src/webapp.ts(5,30): error TS2307: Cannot find module '@trigger.dev/database' or its corresponding type declarations.
../../internal-packages/testcontainers/src/webapp.ts(257,40): error TS7006: Parameter 'err' implicitly has an 'any' type.
../../internal-packages/tracing/src/index.ts(9,35): error TS2307: Cannot find module '@trigger.dev/core/v3/utils/flattenAttributes' or its corresponding type declarations.
../../internal-packages/zod-worker/src/index.ts(2,35): error TS2307: Cannot find module '@trigger.dev/core/v3' or its corresponding type declarations.
../../internal-packages/zod-worker/src/index.ts(23,24): error TS2307: Cannot find module '@trigger.dev/core/logger' or its corresponding type declarations.
../../internal-packages/zod-worker/src/index.ts(28,8): error TS2307: Cannot find module '@trigger.dev/database' or its corresponding type declarations.
../../internal-packages/zod-worker/src/pgListen.server.ts(1,24): error TS2307: Cannot find module '@trigger.dev/core/logger' or its corresponding type declarations.
/home/runner/work/Flowcordia/Flowcordia/apps/webapp:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  webapp@1.0.0 typecheck: `cross-env NODE_OPTIONS="--max-old-space-size=8192" tsc --noEmit -p ./tsconfig.check.json`
Exit status 2

```
| Studio route tests | PASS |
| Webapp production build | FAIL (1) |

## Webapp production build failure

```text

> webapp@1.0.0 prebuild /home/runner/work/Flowcordia/Flowcordia/apps/webapp
> pnpm --filter @flowcordia/studio-activepieces build && pnpm --filter @flowcordia/studio-activepieces copy:webapp


> @flowcordia/studio-activepieces@0.1.0 build /home/runner/work/Flowcordia/Flowcordia/apps/flowcordia-studio-activepieces
> node scripts/run-with-activepieces-tsconfig.mjs vite build --config vite.config.mts

[36mvite v6.4.3 [32mbuilding for production...[36m[39m
transforming...
[32m✓[39m 5 modules transformed.
[31m✗[39m Build failed in 86ms
[31merror during build:
[31m[vite:load-fallback] Could not load /home/runner/work/Flowcordia/Flowcordia/studio-v2/activepieces-web/src/index.css (imported by src/main.tsx): ENOENT: no such file or directory, open '/home/runner/work/Flowcordia/Flowcordia/studio-v2/activepieces-web/src/index.css'[31m
    at async open (node:internal/fs/promises:637:25)
    at async Object.readFile (node:internal/fs/promises:1249:14)
    at async Object.handler (file:///home/runner/work/Flowcordia/Flowcordia/node_modules/.pnpm/vite@6.4.3_@types+node@20.14.14_jiti@2.6.1_lightningcss@1.30.2_terser@5.46.1_tsx@4.22.4_yaml@2.9.0/node_modules/vite/dist/node/chunks/dep-Dm0c1Wj2.js:46002:27)
    at async PluginDriver.hookFirstAndGetPlugin (file:///home/runner/work/Flowcordia/Flowcordia/node_modules/.pnpm/rollup@4.60.1/node_modules/rollup/dist/es/shared/node-entry.js:22849:28)
    at async file:///home/runner/work/Flowcordia/Flowcordia/node_modules/.pnpm/rollup@4.60.1/node_modules/rollup/dist/es/shared/node-entry.js:21833:33
    at async Queue.work (file:///home/runner/work/Flowcordia/Flowcordia/node_modules/.pnpm/rollup@4.60.1/node_modules/rollup/dist/es/shared/node-entry.js:23077:32)[39m
/home/runner/work/Flowcordia/Flowcordia/apps/flowcordia-studio-activepieces:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @flowcordia/studio-activepieces@0.1.0 build: `node scripts/run-with-activepieces-tsconfig.mjs vite build --config vite.config.mts`
Exit status 1
/home/runner/work/Flowcordia/Flowcordia/apps/webapp:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  webapp@1.0.0 prebuild: `pnpm --filter @flowcordia/studio-activepieces build && pnpm --filter @flowcordia/studio-activepieces copy:webapp`
Exit status 1

```
