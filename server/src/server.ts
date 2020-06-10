import {
	createConnection,
	TextDocuments,
	Diagnostic,
	DiagnosticSeverity,
	ProposedFeatures,
	InitializeParams,
	TextDocumentSyncKind,
	ExecuteCommandParams,
	InitializeResult
} from 'vscode-languageserver';

import {
	TextDocument, DocumentUri
} from 'vscode-languageserver-textdocument';

import { exec, execSync } from "child_process";

// Create a connection for the server. The connection uses Node's IPC as a transport.
let connection = createConnection(ProposedFeatures.all);

// We need multi workspace server because we need to mount different
// workspace directory into mgd container per project
let workspaceFolder: string | null | undefined;

interface HealthBotSettings {
	mgd: string | null;
}

let settings: Thenable<HealthBotSettings>

function getSettings(): Thenable<HealthBotSettings> {
	settings = connection.workspace.getConfiguration({
		scopeUri: 'window',
		section: 'healthbot'
	});
	return settings
}

// MGD Initilization
let invokationCount = 0

async function runInMgd(callback: any) {
	let d = new Date()
	const mgdContainerName =  'vscode_mgd' + d.getTime() + '_' + invokationCount
	invokationCount += 1
	let resolvedSettings = await getSettings()
	const mgd_image = resolvedSettings.mgd
	if (!mgd_image) {
		console.log("MGD image not set. Please set the MGD image in your preferences.")
		return
	}
	let cmd = `docker run -d -v ${workspaceFolder}:/rules --name ${mgdContainerName} ${mgd_image}`
	console.log("Starting mgd container with image", mgd_image)
	try {
		execSync(cmd)
	} catch(Error) {
		console.log("Unable to start MGD container. Is the image name", mgd_image, "correct?")
		return
	}
	await callback(mgdContainerName)
	exec(`docker rm -f ${mgdContainerName}`)
	console.log("Finished Validation")

}

// Create a simple text document manager. The text document manager
// supports full document sync only
let documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

connection.onInitialize((params: InitializeParams) => {
	workspaceFolder = params.rootUri?.split("file://")[1];
	const result: InitializeResult = {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Incremental
		}
	};
	return result;
});


connection.onExecuteCommand((params: ExecuteCommandParams): void => {
	if (params.command = 'healthbot.validate') {
		if (params.arguments !== undefined) {
			validateTextDocument(params.arguments[0])
		} else {
			console.log("Active document not set")
		}
	}
})

// documents.onDidChangeContent(change => {
// 	validateTextDocument(change.document);
// });

async function validateTextDocument(uri: DocumentUri): Promise<void> {
	let diagnostics: Diagnostic[] = [];
	if (workspaceFolder == null) {
		console.log("Workspace directory not set. Not running validation.")
		return
	}
	let fileName = uri.split(workspaceFolder)[1]
	let inDockerFileName = `/rules${fileName}`
	console.log("\nValidating document", fileName)

	const loadIntoMgd = (mgdContainerName: string) => {
		const output = String(execSync(`docker exec ${mgdContainerName} bash -c 'cli -c \"edit; load override ${inDockerFileName}\"'`))
		let lines = output.split('\n')
		//|/rules/test.txt:17:(28) syntax error: descriasdsaption
		let regex = `.*:(\\d+):\\((\\d+)\\)\\ssyntax\\serror:\\s(.*)`
		for (let line of lines) {
			if (line.charAt(0) == '|') {
				let matches = line.match(regex)
				if (matches === null) {
					continue
				}
				const lineNumber = matches[1]
				const endIdx = matches[2]
				const erroredKw = matches[3]
				const startIdx = Number(endIdx) - erroredKw.length
				const error = `syntax error: ${erroredKw}`
				console.log("syntax error at line", lineNumber, "startIdx", startIdx, "endIdx", endIdx)
				let diagnostic: Diagnostic = {
					severity: DiagnosticSeverity.Error,
					range: {
						start: {
							"character": Number(startIdx),
							"line": Number(lineNumber)-1
						},
						end: {
							"character": Number(endIdx),
							"line": Number(lineNumber)-1
						}
					},
					message: `${error}`,
					source: 'ex'
				};
				diagnostics.push(diagnostic)
			}
		}
		connection.sendDiagnostics({ uri: uri, diagnostics });
	}
	await runInMgd(loadIntoMgd)
}


documents.listen(connection);

// Listen on the connection
connection.listen();
