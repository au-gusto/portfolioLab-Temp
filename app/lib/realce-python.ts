/**
 * app/lib/realce-python.ts
 *
 * Realce de sintaxe para Python, escrito à mão.
 *
 * Poderia ser uma biblioteca, mas as candidatas (highlight.js, prism, shiki)
 * custam de 30 KB a alguns megabytes só para colorir um punhado de blocos de
 * código que já estão no cliente. O que precisamos é um léxico de Python, e
 * léxico de Python cabe em um regex.
 *
 * A ordem dos casos importa mais do que os padrões em si: comentário e string
 * vêm primeiro porque tudo que estiver dentro deles não é código. Um `# def`
 * é comentário, e um `"if"` é texto — trocar a ordem produziria palavras-chave
 * coloridas dentro de strings, que é o erro clássico de realce ingênuo.
 */

const PALAVRAS = new Set([
  "False", "None", "True", "and", "as", "assert", "async", "await", "break",
  "class", "continue", "def", "del", "elif", "else", "except", "finally",
  "for", "from", "global", "if", "import", "in", "is", "lambda", "nonlocal",
  "not", "or", "pass", "raise", "return", "try", "while", "with", "yield",
]);

/** Nomes que o Python já traz e que valem destacar de variáveis comuns. */
const EMBUTIDOS = new Set([
  "abs", "all", "any", "bool", "dict", "enumerate", "float", "int", "len",
  "list", "max", "min", "print", "range", "round", "set", "sorted", "str",
  "sum", "tuple", "type", "zip", "isinstance", "getattr", "hasattr", "super",
  "self", "Exception", "ValueError", "TypeError", "KeyError",
]);

/**
 * Um caso por tipo de token. Alternativas em ordem de precedência — a primeira
 * que casar vence, e é por isso que comentário e string encabeçam a lista.
 */
const LEXICO = new RegExp(
  [
    // Comentário até o fim da linha
    "(#[^\\n]*)",
    // Strings de três aspas, com ou sem prefixo (f, r, b, u)
    "([fFrRbBuU]{0,2}(?:'''[\\s\\S]*?'''|\"\"\"[\\s\\S]*?\"\"\"))",
    // Strings de uma linha, tolerando escape
    "([fFrRbBuU]{0,2}(?:'(?:\\\\.|[^'\\\\\\n])*'|\"(?:\\\\.|[^\"\\\\\\n])*\"))",
    // Decorador
    "(@[A-Za-z_][A-Za-z0-9_]*)",
    // Nome logo depois de def ou class
    "(?<=\\b(?:def|class)\\s)([A-Za-z_][A-Za-z0-9_]*)",
    // Número: decimal, científico, hexadecimal
    "(\\b(?:0[xX][0-9a-fA-F_]+|\\d[\\d_]*\\.?[\\d_]*(?:[eE][+-]?\\d+)?)\\b)",
    // Identificador (decidimos depois se é palavra-chave, embutido ou nome)
    "([A-Za-z_][A-Za-z0-9_]*)",
    // Operadores
    "([+\\-*/%=<>!&|^~@]+)",
  ].join("|"),
  "g",
);

const ESCAPES: Record<string, string> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
};

function escapar(t: string): string {
  return t.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

function span(classe: string, texto: string): string {
  return `<span class="py-${classe}">${escapar(texto)}</span>`;
}

/**
 * Devolve HTML com os tokens embrulhados em `<span class="py-…">`.
 *
 * O texto entre tokens é escapado e copiado como está, então o resultado tem
 * exatamente os mesmos caracteres da entrada — é isso que permite sobrepor o
 * realce a um `<textarea>` transparente sem que as letras saiam de registro.
 */
export function realcarPython(codigo: string): string {
  let saida = "";
  let ultimo = 0;

  LEXICO.lastIndex = 0;
  let achado: RegExpExecArray | null;

  while ((achado = LEXICO.exec(codigo)) !== null) {
    const [inteiro, comentario, tresAspas, aspas, decorador, definicao, numero, nome, operador] = achado;

    // Evita laço infinito num casamento vazio (operador pode casar "" em
    // motores permissivos).
    if (inteiro === "") { LEXICO.lastIndex++; continue; }

    saida += escapar(codigo.slice(ultimo, achado.index));

    if (comentario) saida += span("comentario", comentario);
    else if (tresAspas) saida += span("texto", tresAspas);
    else if (aspas) saida += span("texto", aspas);
    else if (decorador) saida += span("decorador", decorador);
    else if (definicao) saida += span("definicao", definicao);
    else if (numero) saida += span("numero", numero);
    else if (nome) {
      if (PALAVRAS.has(nome)) saida += span("palavra", nome);
      else if (EMBUTIDOS.has(nome)) saida += span("embutido", nome);
      else saida += escapar(nome);
    } else if (operador) saida += span("operador", operador);
    else saida += escapar(inteiro);

    ultimo = achado.index + inteiro.length;
  }

  saida += escapar(codigo.slice(ultimo));

  // O <pre> come a última linha quando o texto termina em quebra; o espaço
  // impede que a numeração e o cursor saiam de sincronia no fim do arquivo.
  return saida + "\n";
}

/** Quantas linhas o código tem, para a régua lateral. */
export function contarLinhas(codigo: string): number {
  let n = 1;
  for (let i = 0; i < codigo.length; i++) if (codigo[i] === "\n") n++;
  return n;
}
