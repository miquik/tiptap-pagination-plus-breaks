# tiptap-pagination-plus-breaks

Estensione di paginazione per Tiptap 3, basata su `vel/src/plugins/paginationV12.ts`.

```ts
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { PaginationV12 } from 'tiptap-pagination-plus-breaks'

const editor = new Editor({
  element: document.querySelector('#editor'),
  extensions: [StarterKit, PaginationV12.configure({
    pageWidth: 600,
    pageHeight: 800,
    pageGap: 50,
    header: '',
    footer: 'Pagina {page} di {total}',
    initializeOnPaste: true,
  })],
  content: '<p>Primo paragrafo</p>',
})

editor.commands.resetPagination()
```

Richiede `@tiptap/core` e `@tiptap/pm` versione 3.4.2 o successiva nella serie 3.
Il pacchetto espone anche `PaginationV12Options`, `PaginationV12Storage`,
`PaginationV12Divider` e `paginationV12PluginKey`. Gli export precedenti
`PaginationPlus`, `PaginationPlusV1` e `PaginationPlusV2` sono conservati;
utilizzare una sola estensione di paginazione per editor.

`header` e `footer` accettano HTML con segnaposto `{page}` (da 1) e `{total}`,
oppure una funzione `(pageIndex, numPages, editorDOM, intersectionIndex?) => HTMLElement`.
L'indice passato alle funzioni parte da zero. Usare solo HTML fidato.
Le dimensioni e i margini sono in pixel; l'area di contenuto deve restare positiva.
Per tutte le opzioni vedere `src/paginationV12Types.ts` e i default in `src/paginationV12.ts`.

## Sviluppo

```sh
npm install
npm test
npm run build
npm pack --dry-run
```

La build genera JavaScript CommonJS e dichiarazioni TypeScript in `dist`.
`prepack` ricompila prima della creazione del pacchetto.

## Limiti e miglioramenti

La paginazione usa misure DOM e decorazioni: richiede un browser con layout reale.
I divisori `[data-vdiv]` dipendono dai nodi forniti dall'applicazione; il pacchetto
non registra uno schema per questi nodi. Le decorazioni non sono salvate nel documento.
Il comportamento V12 dei divisori pu? rendere male i bordi dei paragrafi che
attraversano una pagina. Una separazione fisica dei contenuti richiede un intervento
sull'algoritmo e sullo schema, da verificare con selezione, undo e copia/incolla.

I test automatici coprono API del pacchetto, intersezioni, input degeneri,
immagini fallite e annullamento delle misure. La verifica visiva in browser di
immagini, tabelle, paragrafi lunghi, zoom, ridimensionamento e stampa resta necessaria.
La V12 non osserva ancora in modo generale ogni cambiamento di dimensioni successivo
alla prima misura: `ResizeObserver` e test browser sono i prossimi miglioramenti.
