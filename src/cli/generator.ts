import fs from 'fs';
import { CompositeGeneratorNode, toString } from 'langium';
import path from 'path';
import * as AST from '../language-server/generated/ast';
import { extractDestinationAndName } from './cli-util';

export function generateJavaScript(model: AST.Program, filePath: string, destination: string | undefined): string {
    const data = extractDestinationAndName(filePath, destination);
    const generatedFilePath = `${path.join(data.destination, data.name)}.js`;

    const fileNode = new CompositeGeneratorNode();

    // @ts-ignore
    for (const statement of model.declarations[0].block.statements) {
        console.log(`${statement?.expression?.$type ?? statement.$type} ${statement?.expression?.op ?? ""}`);
    }
    // fileNode.append('"use strict";', NL, NL);
    // model.greetings.forEach(greeting => fileNode.append(`console.log('Hello, ${greeting.person.ref?.name}!');`, NL));

    if (!fs.existsSync(data.destination)) {
        fs.mkdirSync(data.destination, { recursive: true });
    }
    fs.writeFileSync(generatedFilePath, toString(fileNode));
    return generatedFilePath;
}
