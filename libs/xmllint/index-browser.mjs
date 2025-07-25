'use strict';

/** @type {import("./index").MemoryPagesConstant} */
const memoryPages = {
	MiB: 16,
	GiB: 16384,
	defaultInitialMemoryPages: 256 /* 16MiB */,
	defaultMaxMemoryPages: 512 /* 32MiB */,
	max: 65536
};

/**
 * @returns {{fileName: string, contents: string}[]}
 */
function normalizeInput(fileInput, extension) {
	if (!Array.isArray(fileInput)) fileInput = [fileInput];
	return fileInput.map((xmlInfo, i) => {
		if (typeof xmlInfo === 'string') {
			return {
				fileName: `file_${i}.${extension}`,
				contents: xmlInfo,
			};
		} else {
			return xmlInfo;
		}
	});
}

/**
 * @param {import("./index").XMLLintOptions} options 
 */
function preprocessOptions(options) {
	const xmls = normalizeInput(options.xml, 'xml');
	const extension = options.extension || 'schema';

	validateOption(['schema', 'relaxng'], 'extension', extension);

	const schemas = normalizeInput(options.schema || [], 'xsd');
	const preloads = normalizeInput(options.preload || [], 'xml');

	if (!options.disableFileNameValidation)	{
		for (const file of xmls.concat(schemas)) {
			if (/(^|\s)-/.test(file.fileName)) {
				throw new Error(`Invalid file name "${file.fileName}" that would be interpreted as a command line option.`);
			}
		}
	}

	const normalization = options.normalization || '';
	validateOption(['', 'format', 'c14n'], 'normalization', normalization);

	const inputFiles = xmls.concat(schemas, preloads);

	/** @type string[] */
	let args = [];
	schemas.forEach(function(schema) {
		args.push(`--${extension}`);
		args.push(schema['fileName']);
	});

	if (normalization) {
		args.push(`--${normalization}`);
	} else {
		// If no normalization is requested, we'll default to no output at all to "normalized" field.
		args.push('--noout');
	}

	xmls.forEach(function(xml) {
		args.push(xml['fileName']);
	});

	if (options.modifyArguments) {
		args = options.modifyArguments(args);
		if (!Array.isArray(args)) {
			throw new Error('modifyArguments must return an array of arguments');
		}
	}

	const opts = {
		inputFiles, args,
		initialMemory: options.initialMemoryPages || memoryPages.defaultInitialMemoryPages,
		maxMemory: options.maxMemoryPages || memoryPages.defaultMaxMemoryPages,
	};

	validateMemoryLimitOptions(opts);

	return opts;
}

function validationSucceeded(exitCode) {
	if (exitCode === 0) {
		return true;
	} else if (exitCode === 3 || exitCode === 4 /* validationError */) {
		return false;
	} else /* unknown situation */ {
		return null;
	}
}

function validateOption(allowedValues, optionName, actualValue) {
	if (!allowedValues.includes(actualValue)) {
		const actualValueStr = typeof actualValue === 'string' ? `"${actualValue}"` : actualValue;
		throw new Error(`Invalid value for option ${optionName}: ${actualValueStr}`);
	}
}

function validateMemoryLimitOptions({initialMemory, maxMemory}) {
	if (initialMemory < 0 || maxMemory < initialMemory || maxMemory > memoryPages.max) {
		throw new Error(
			'Invalid memory options.'
			+ ` Expected 0 < initialMemoryPages (${initialMemory}) <= maxMemoryPages (${maxMemory}) <= 4GiB (${memoryPages.max})`
		);
	}
}

function parseErrors(/** @type {string} */ output) {
	const errorLines = output
		.split('\n')
		.slice(0, -2);

	return errorLines.map(line => {
		const [fileName, lineNumber, ...rest] = line.split(':');
		if (fileName && lineNumber && rest.length) {
			return {
				rawMessage: line,
				message: rest.join(':').trim(),
				loc: {
					fileName,
					lineNumber: parseInt(lineNumber),
				}
			};
		} else {
			return {
				rawMessage: line,
				message: line,
				loc: null,
			};
		}
	}).filter(errorInfo => {
		// xmllint outputs "file.xml validates" for those files that are valid.
		const wasValid = !errorInfo.loc && errorInfo.rawMessage
			.trim()
			.endsWith(' validates');
		// don't list those files in errors list
		return !wasValid;
	});
}

/** @type {import("./index").validateXML} */
function validateXML(options) {
	const preprocessedOptions = preprocessOptions(options);
	var worker;

	return new Promise(function validateXMLPromiseCb(resolve, reject) {
		function onmessage(event) {
			var data = event.data;

			const valid = validationSucceeded(data.exitCode);
			if (valid === null) {
				const err = new Error(data.stderr);
				err.code = data.exitCode;
				reject(err);
			} else {
				resolve({
					valid: valid,
					normalized: data.stdout,
					errors: valid ? [] : parseErrors(data.stderr),
					rawOutput: data.stderr
					/* Traditionally, stdout has been suppressed both
					 * by libxml2 compile options as well as explict
					 * --noout in arguments; hence »rawOutput« refers
					 * only to stderr, which is a reasonable attribute value
					 * despite the slightly odd attribute name.
					 */
				});
			}
		}

		function onerror(err) {
			reject(err);
		}

		worker = new Worker(new URL('./xmllint-browser.mjs', import.meta.url), { type: 'module' });

		var addEventListener = worker.addEventListener.bind(worker);

		addEventListener('message', onmessage);
		addEventListener('error', onerror);
		worker.postMessage(preprocessedOptions);
	}).finally(() => {
		if (worker) {
			return worker.terminate();
		}
	});
}

export { validateXML, memoryPages };
