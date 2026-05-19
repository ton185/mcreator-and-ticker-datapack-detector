document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('fileInput');
    const runBtn = document.getElementById('runBtn');
    const status = document.getElementById('status');
    const resultsBody = document.getElementById('resultsBody');
    const progressContainer = document.getElementById('progressContainer');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const filterNotFound = document.getElementById('filterNotFound');

    let allResults = [];

    // Options
    const onlyFunctions = document.getElementById('onlyFunctions');
    const mcreator = document.getElementById('mcreator');
    const onlyTickers = document.getElementById('onlyTickers');
    const extensiveCheck = document.getElementById('extensiveCheck');
    const searchForFile = document.getElementById('searchForFile');

    filterNotFound.addEventListener('change', renderTable);

    runBtn.addEventListener('click', async () => {
        const files = Array.from(fileInput.files);
        if (files.length === 0) {
            alert('Please select at least one .jar file.');
            return;
        }

        // Reset UI
        allResults = [];
        resultsBody.innerHTML = '';
        status.textContent = 'Running...';
        runBtn.disabled = true;

        // Reset Progress Bar
        progressContainer.style.display = 'block';
        progressBar.style.width = '0%';
        progressText.textContent = '';

        const options = {
            onlyFunctions: onlyFunctions.checked,
            mcreator: mcreator.checked,
            onlyTickers: onlyTickers.checked,
            extensiveCheck: extensiveCheck.checked,
            fileNameRegex: parseRegex(searchForFile.value)
        };

        const totalFiles = files.length;
        let processedFiles = 0;

        for (const file of files) {
            status.textContent = `Processing: ${file.name}`;
            const result = await processFile(file, options);
            allResults.push(result);
            renderTable();

            processedFiles++;
            const percentage = Math.round((processedFiles / totalFiles) * 100);
            progressBar.style.width = `${percentage}%`;
            progressText.textContent = `${percentage}% (${processedFiles}/${totalFiles})`;
        }

        status.textContent = 'Finished.';
        runBtn.disabled = false;
        
        // Hide progress bar after a short delay
        setTimeout(() => {
            progressContainer.style.display = 'none';
        }, 2000);
    });

    function parseRegex(str) {
        if (!str) return null;
        if (str.startsWith('/')) {
            const lastSlashIndex = str.lastIndexOf('/');
            if (lastSlashIndex === 0) return null;
            const flags = str.substring(lastSlashIndex + 1);
            const pattern = str.substring(1, lastSlashIndex);
            try {
                return new RegExp(pattern, flags);
            } catch (e) {
                console.error('Invalid regex:', e);
                return null;
            }
        }
        try {
            return new RegExp(str);
        } catch (e) {
            console.error('Invalid regex:', e);
            return null;
        }
    }


    async function processFile(file, options) {
        let result = {
            name: file.name,
            pass: false,
            error: null,
            matchedCriteria: []
        };

        try {
            const reader = new zip.ZipReader(new zip.BlobReader(file));
            const entries = await reader.getEntries();

            // 1. Check mcreator
            if (options.mcreator) {
                if (entries.some(entry => entry.filename.startsWith("net/mcreator/"))) {
                    result.matchedCriteria.push('MCreator');
                }
            }

            // 2. Check onlyTickers
            if (options.onlyTickers) {
                const tickJsonEntry = entries.find(e => e.filename === "data/minecraft/tags/functions/tick.json");
                if (tickJsonEntry) {
                    if (options.extensiveCheck) {
                        const content = await getTextFromFileEntry(tickJsonEntry);
                        const jsonParsed = JSON.parse(content);
                        if (jsonParsed.values && Array.isArray(jsonParsed.values) && jsonParsed.values.length > 0) {
                            result.matchedCriteria.push('ticker');
                        }
                    } else {
                        result.matchedCriteria.push('ticker');
                    }
                }
            }

            // 3. Check onlyFunctions
            if (options.onlyFunctions) {
                if (entries.some(entry => /\.mcfunction$/.test(entry.filename))) {
                    result.matchedCriteria.push('mcfunction');
                }
            }

            // 4. Check fileNameRegex
            if (options.fileNameRegex) {
                const regex = options.fileNameRegex;
                if (entries.some(entry => regex.test(entry.filename))) {
                    result.matchedCriteria.push('file (regex)');
                }
            }

            if (result.matchedCriteria.length > 0) {
                result.pass = true;
            }

            // 5. Default: if NO selectors are selected, check for data/
            const anySelector = options.fileNameRegex || options.onlyFunctions || options.mcreator || options.onlyTickers;
            if (!result.pass && !anySelector) {
                if (entries.some(e => e.filename.startsWith("data/"))) {
                    result.pass = true;
                    result.matchedCriteria.push('data/');
                }
            }

            await reader.close();
        } catch (e) {
            result.error = e.message;
        }

        return result;
    }

    async function getTextFromFileEntry(file) {
        let tds = new TextDecoderStream();
        let data = file.getData(tds.writable);
        let total = '';
        for await (const chunk of tds.readable) {
              total += chunk;
        }
        return total;
    }

    function renderTable() {
        resultsBody.innerHTML = '';

        const filtered = allResults.filter(r => {
            if (filterNotFound.checked) {
                return r.pass || r.error;
            }
            return true;
        });

        const sorted = filtered.sort((a, b) => {
            const getPriority = (r) => {
                if (r.pass && !r.error) return 1;
                if (r.error) return 2;
                return 3;
            };
            return getPriority(a) - getPriority(b);
        });

        for (const result of sorted) {
            const row = document.createElement('tr');
            
            const nameCell = document.createElement('td');
            nameCell.textContent = result.name;
            row.appendChild(nameCell);

            const resultCell = document.createElement('td');
            if (result.error) {
                resultCell.textContent = 'ERROR';
                resultCell.className = 'result-error';
            } else if (result.pass) {
                resultCell.textContent = 'FOUND';
                resultCell.className = 'result-pass';
            } else {
                resultCell.textContent = 'NOT FOUND';
                resultCell.className = 'result-fail';
            }
            row.appendChild(resultCell);

            const detailsCell = document.createElement('td');
            if (result.error) {
                detailsCell.textContent = result.error;
            } else if (!result.pass) {
                detailsCell.textContent = '-';
            } else {
                detailsCell.textContent = result.matchedCriteria.join(' + ');
            }
            row.appendChild(detailsCell);

            resultsBody.appendChild(row);
        }
    }
});
