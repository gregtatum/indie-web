declare module 'turndown' {
  class TurndownService {
    constructor(options?: Options);

    addRule(key: string, rule: Rule): this;
    keep(filter: Filter): this;
    remove(filter: Filter): this;
    use(plugins: Plugin | Plugin[]): this;
    escape(str: string): string;

    turndown(html: string | Node): string;

    options: Options;
    rules: Rules;
  }

  // eslint-disable-next-line import/no-default-export
  export default TurndownService;

  interface Options {
    headingStyle?: 'setext' | 'atx' | undefined;
    hr?: string | undefined;
    br?: string | undefined;
    bulletListMarker?: '-' | '+' | '*' | undefined;
    codeBlockStyle?: 'indented' | 'fenced' | undefined;
    emDelimiter?: '_' | '*' | undefined;
    fence?: '```' | '~~~' | undefined;
    strongDelimiter?: '__' | '**' | undefined;
    linkStyle?: 'inlined' | 'referenced' | undefined;
    linkReferenceStyle?: 'full' | 'collapsed' | 'shortcut' | undefined;

    keepReplacement?: ReplacementFunction | undefined;
    blankReplacement?: ReplacementFunction | undefined;
    defaultReplacement?: ReplacementFunction | undefined;
  }

  interface Rule {
    filter: Filter;
    replacement?: ReplacementFunction | undefined;
  }

  interface Rules {
    options: Options;
    array: Rule[];

    blankRule: ReplacementFunction;
    defaultRule: ReplacementFunction;
    keepReplacement: ReplacementFunction;

    add(key: Filter, rule: Rule): void;
    forEach(callback: (rule: Rule, index: number) => any): void;
    forNode(node: Node): Rule;
    keep(filter: Filter): void;
    remove(filter: Filter): void;
  }

  type Plugin = (service: TurndownService) => void;
  type Node = HTMLElement | Document | DocumentFragment;

  type Filter = TagName | TagName[] | FilterFunction;
  type FilterFunction = (node: HTMLElement, options: Options) => boolean;

  type ReplacementFunction = (
    content: string,
    node: Node,
    options: Options,
  ) => string;

  type TagName = keyof HTMLElementTagNameMap;
}
