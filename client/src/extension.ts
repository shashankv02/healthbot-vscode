import * as path from 'path';
import { commands, workspace, window, ExtensionContext } from 'vscode';

import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind
} from 'vscode-languageclient';

let client: LanguageClient;

const validateCommandHandler = async () => {
	console.log("in client side handler")
	let mgd = workspace.getConfiguration().get("healthbot.mgd")
	console.log("Client mgd config", mgd)
	if (mgd === undefined || mgd == "") {
		mgd = await window.showInputBox({prompt: "Enter MGD image name", value: ""})
	}
	let openDocUri = window.activeTextEditor.document.uri.toString()
	await client.sendRequest("workspace/executeCommand", {command: "healthbot.validate", arguments: [openDocUri]})
}

const registerValidateCommand = (context) => {
	console.log("Registering")
	console.log(context)
 	context.subscriptions.push(commands.registerCommand('healthbot.validate', validateCommandHandler))
}

export function activate(context: ExtensionContext) {
	registerValidateCommand(context)
	let serverModule = context.asAbsolutePath(
		path.join('server', 'out', 'server.js')
	);
	// The debug options for the server
	// --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
	let debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };

	let serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: {
			module: serverModule,
			transport: TransportKind.ipc,
			options: debugOptions
		}
	};

	let clientOptions: LanguageClientOptions = {
		// Register the server for HealthBot language documents
		documentSelector: [{ scheme: 'file', language: 'HealthBot' }],
	};

	// Create the language client and start the client.
	client = new LanguageClient(
		'HealthBot',
		'HealthBot DSL',
		serverOptions,
		clientOptions
	);

	// Start the client. This will also launch the server
	client.start();
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}
