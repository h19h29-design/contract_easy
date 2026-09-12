# HWPX baseline provenance

`Skeleton.hwpx` is the unmodified blank package from airmang/python-hwpx,
commit `bf40152e5202a55af76f97fe8c2d60eed43f0b00`, path `src/hwpx/data/Skeleton.hwpx`.
Source: https://github.com/airmang/python-hwpx/tree/bf40152e5202a55af76f97fe8c2d60eed43f0b00
License: Apache-2.0; LICENSE and NOTICE are retained alongside it and in generated packages.

Runtime modifications: replace section0 with editable contract tables/paragraphs,
add a solid table-border definition, replace metadata and preview text, and omit
the stale blank preview image. No scripts, macros, OLE objects or external fetches.
The table XML structure was checked against the project's Apache-2.0 OXML table
implementation; the local generator is TypeScript and has no Python runtime dependency.

Contract field/wording source: the existing archived 2026.5 원클릭 distribution,
`3.공사표준계약서`, `14.착공계`, `24.준공계`, `30.대금청구서`,
`16.현장대리인계`, `17.공정표`;
see `docs/harness/CONTRACT_FORMS_AUDIT.md`.
Each form exports only its selected fields, including internal preview text.
Bank fields are restricted to the payment form. Workbook formulas are not run.
Representative identity fields are restricted to the representative form.
The schedule is a manually entered period table, not the original daily bar chart.
Batch ZIPs contain only explicitly selected forms from one immutable revision.
The contract layout is a reflowed editable draft, not an exact Excel print facsimile.
No rates, warranty periods or legal decisions are inherited automatically.

본 제품은 한글과컴퓨터의 ᄒᆞᆫ글 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.
Native Hancom rendering/edit/save verification is required separately from ZIP/XML checks.
