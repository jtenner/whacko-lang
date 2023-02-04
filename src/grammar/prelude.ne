@preprocessor typescript

@{%
  const identity = (d: any) => d[0];
%}

Entry -> ProgramNode {% identity %}

List[Item, Sep] -> $Item ($Sep $Item):* {%
  (d: any) => [d[0][0], ...d[1].map((e: any) => e[1][0])]
%}

