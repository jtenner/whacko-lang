@{%

export class IdentifierNode extends Node {
  constructor(
    public name: string,
  ) {
    super();
  }
}

%}


Identifier -> [$_a-zA-Z] [$_a-zA-Z0-9]:* {%
  (d: any) => new IdentifierNode(d[0] + d[1].join(""))
%}

