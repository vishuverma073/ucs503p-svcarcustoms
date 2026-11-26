# Reports

All reports are written in LaTeX in the TIET formats and compiled with
[Tectonic](https://tectonic-typesetting.github.io). The PDFs are committed next
to their sources.

| Report | PDF | Source |
|--------|-----|--------|
| Project proposal | [main.pdf](https://github.com/vishuverma073/ucs503p-svcarcustoms/blob/master/project-proposal/main.pdf) | `project-proposal/main.tex` |
| Software Requirements Specification v1.1 | [main.pdf](https://github.com/vishuverma073/ucs503p-svcarcustoms/blob/master/srs/main.pdf) | `srs/main.tex` |
| Prototype-stage (mid-semester) report, revised | [main.pdf](https://github.com/vishuverma073/ucs503p-svcarcustoms/blob/master/project-report-prototype-stage/main.pdf) | `project-report-prototype-stage/main.tex` |
| Final report | [main.pdf](https://github.com/vishuverma073/ucs503p-svcarcustoms/blob/master/project-report-final/main.pdf) | `project-report-final/main.tex` |

To rebuild a report:

```bash
brew install tectonic        # or see tectonic-typesetting.github.io
cd project-report-final && tectonic -X compile main.tex
```
