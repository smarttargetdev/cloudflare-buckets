export type AppLocale = 'pt-BR' | 'en-US';

export const DEFAULT_LOCALE: AppLocale = 'pt-BR';

const LOCALE_STORAGE_KEY = 'buckets.locale';

let currentLocale: AppLocale = DEFAULT_LOCALE;

export function getActiveLocale(): AppLocale {
  if (typeof window !== 'undefined') {
    try {
      const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
      if (saved === 'pt-BR' || saved === 'en-US') {
        currentLocale = saved;
      }
    } catch {
      // ignore storage errors in restricted contexts
    }
  }
  return currentLocale;
}

export function setActiveLocale(locale: AppLocale): void {
  currentLocale = locale;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // ignore storage errors
    }
  }
}

export function formatTemplate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_m, key: string) =>
    key in vars ? String(vars[key]) : '',
  );
}

export interface TranslationCatalog {
  nav: {
    buckets: string;
    editor: string;
    search: string;
    telemetry: string;
    expo: string;
    wrangler: string;
    monorepo: string;
  };
  shell: {
    brand: string;
    r2Connected: string;
    r2Credentials: string;
    sandboxLocal: string;
    cloudflareR2: string;
    shortcutHint: string;
    lightThemeAria: string;
    darkThemeAria: string;
    languageLabel: string;
    portugueseOption: string;
    englishOption: string;
  };
  buckets: {
    bulkDone: string;
    bulkDeleteOp: string;
    bulkMoveOp: string;
    bulkSummary: string;
    bulkFirstError: string;
    dismiss: string;
    title: string;
    subtitle: string;
    refresh: string;
    newBucket: string;
    loadingBuckets: string;
    emptyBuckets: string;
    objectsUnit: string;
    deleteEmptyBucketTitle: string;
    folderBreadcrumbsAria: string;
    newFile: string;
    newFolder: string;
    uploadFile: string;
    selectedItems: string;
    bulkMove: string;
    deleteSelected: string;
    selectAllAria: string;
    colNamePrefix: string;
    colTypeMetadata: string;
    colSize: string;
    colModified: string;
    colActions: string;
    loadingDirectory: string;
    emptyDirectory: string;
    selectFolderAria: string;
    selectFileAria: string;
    virtualFolderMarker: string;
    virtualFolderPrefix: string;
    openFolder: string;
    editInCodeEditorTitle: string;
    inspectObjectTitle: string;
    presignTitle: string;
    downloadTitle: string;
    openInEditor: string;
    closePanel: string;
    presignedTitle: string;
    tagsPrefix: string;
    createBucketTitle: string;
    bucketNameLabel: string;
    bucketNamePlaceholder: string;
    locationHintLabel: string;
    storageClassLabel: string;
    cancel: string;
    createBucketSubmit: string;
    createFolderTitle: string;
    folderPathLabel: string;
    folderPathPlaceholder: string;
    createMarkerLabel: string;
    createFolderSubmit: string;
    uploadModalTitle: string;
    metadataKeyLabel: string;
    metadataValLabel: string;
    uploading: string;
    uploadSubmit: string;
    bulkMoveModalTitle: string;
    destBucketLabel: string;
    destPrefixLabel: string;
    destPrefixPlaceholder: string;
    overwriteLabel: string;
    confirmMove: string;
    deleteFolderTitle: string;
    forceDeleteBucketTitle: string;
    forceDeleteFolderTitle: string;
    forceDeleteBucketWarning: string;
    forceDeleteFolderWarning: string;
    forceDeleteBucketPrompt: string;
    forceDeleteFolderPrompt: string;
    forceDeleteInputPlaceholder: string;
    forceDeleteConfirmButton: string;
    deleting: string;
    bulkDeleteConfirmTitle: string;
    bulkDeleteConfirmBody: string;
    bulkDeleteConfirmButton: string;
    moving: string;
    moreItems: string;
    dropZonePrompt: string;
    dropOverlayTitle: string;
    dropFolderHint: string;
    uploadingProgress: string;
    dropUploadDone: string;
    uploadModalDropHint: string;
    uploadFilesSelected: string;
    locations: {
      ENAM: string;
      WNAM: string;
      WEUR: string;
      EEUR: string;
      APAC: string;
    };
    storageClasses: {
      Standard: string;
      InfrequentAccess: string;
    };
  };
  editor: {
    title: string;
    subtitle: string;
    viewEdit: string;
    viewSplit: string;
    viewPreview: string;
    autoSaveLabel: string;
    autoSaveOn: string;
    autoSaveOff: string;
    formatCode: string;
    saving: string;
    saveDirty: string;
    saveClean: string;
    destBucketLabel: string;
    filePathLabel: string;
    filePathPlaceholder: string;
    openExistingLabel: string;
    selectExistingPlaceholder: string;
    newTemplateLabel: string;
    loadingContent: string;
    editorAria: string;
    previewHtmlSandbox: string;
    previewMarkdown: string;
    previewPrism: string;
    linesUnit: string;
    autoSaveDisabled: string;
    autoSaveSaving: string;
    autoSavePending: string;
    autoSaveError: string;
    autoSaveSavedAt: string;
    autoSaveReady: string;
    autoSavedNotice: string;
    manualSavedNotice: string;
    formatErrorTitle: string;
    formatErrorFallback: string;
    plainTextLabel: string;
  };
  search: {
    title: string;
    subtitle: string;
    nameOrKeyLabel: string;
    nameOrKeyPlaceholder: string;
    bucketLabel: string;
    allBuckets: string;
    tagKeyLabel: string;
    tagKeyPlaceholder: string;
    tagValueLabel: string;
    tagValuePlaceholder: string;
    searchButton: string;
    ready: string;
    summary: string;
    colBucketKey: string;
    colMetadata: string;
    colMatch: string;
    colSize: string;
    colNavigate: string;
    loading: string;
    empty: string;
    openFolder: string;
  };
  telemetry: {
    kpiRequests: string;
    kpiUptime: string;
    kpiLatency: string;
    kpiServerTimingActive: string;
    kpiThroughput: string;
    kpiThroughputSub: string;
    kpiErrorRate: string;
    kpiErrorsSub: string;
    loadingDashboard: string;
    storageChartTitle: string;
    storageChartSub: string;
    emptyBucketsChart: string;
    storageSeriesLabel: string;
    objectsSeriesLabel: string;
    egressChartTitle: string;
    egressChartSub: string;
    emptyRequestsChart: string;
    requestsSeriesLabel: string;
    s3EgressSeriesLabel: string;
    r2EgressSeriesLabel: string;
    bucketTableTitle: string;
    colBucket: string;
    colObjects: string;
    colStorageUsage: string;
    colRequests: string;
    colEgress: string;
    colR2EgressCost: string;
    colSavingsVsS3: string;
    sinksTitle: string;
    sinksSubtitle: string;
    refreshTelemetry: string;
    sinkActiveLabel: string;
    tailWorkerLabel: string;
    opsTitle: string;
    colOperation: string;
    colCalls: string;
    colErrors: string;
    colAvgMs: string;
    colVolume: string;
    logsTitle: string;
    allLevels: string;
    filterPlaceholder: string;
    downloadLogs: string;
    loadingLogs: string;
    emptyLogs: string;
    opsChartTitle: string;
    opsChartSub: string;
    opsCallsSeries: string;
    opsErrorsSeries: string;
    emptyOpsChart: string;
    totalTrackedStorage: string;
    totalTrackedRequests: string;
  };
  expo: {
    title: string;
    subtitleSuffix: string;
    filterPlaceholder: string;
    selectedCount: string;
    deleteAction: string;
    emptyDirectory: string;
  };
  wrangler: {
    title: string;
    subtitle: string;
    workerNameLabel: string;
    environmentLabel: string;
    enableAnalytics: string;
    enableTailWorker: string;
    activeBindings: string;
    copied: string;
    copyToml: string;
  };
  monorepo: {
    title: string;
    subtitle: string;
    filterAll: string;
    filterDotnet: string;
    filterExpo: string;
    filterWrangler: string;
    packaging: string;
    downloadZip: string;
    copied: string;
    copy: string;
  };
  drawer: {
    title: string;
    closeAria: string;
    executionModeLabel: string;
    sandboxLocal: string;
    cloudflareReal: string;
    sandboxDesc: string;
    cloudflareDesc: string;
    accountIdLabel: string;
    accountIdPlaceholder: string;
    accessKeyLabel: string;
    accessKeyPlaceholder: string;
    secretKeyLabel: string;
    secretKeyPlaceholder: string;
    apiTokenLabel: string;
    apiTokenPlaceholder: string;
    securityNote: string;
    validationMissing: string;
    cancel: string;
    apply: string;
  };
  errorBanner: {
    dismissAria: string;
    traceLabel: string;
  };
  errors: {
    operationErrorTitle: string;
    unexpectedError: string;
    networkFailureTitle: string;
    clientErrorTitle: string;
    unknownErrorTitle: string;
    unknownErrorDetail: string;
    codeMap: Record<string, string>;
    invalidJsonPrefix: string;
    invalidJsonGeneric: string;
    xmlWarning: string;
    tomlBracketWarning: string;
    tomlKeyValueWarning: string;
  };
}

export const TRANSLATIONS: Record<AppLocale, TranslationCatalog> = {
  'pt-BR': {
    nav: {
      buckets: 'Sistema de Arquivos',
      editor: 'Editor de Código',
      search: 'Busca Global',
      telemetry: 'Observabilidade',
      expo: 'Expo Universal',
      wrangler: 'Infraestrutura',
      monorepo: 'Repositório',
    },
    shell: {
      brand: 'Cloudflare Buckets',
      r2Connected: 'R2 Conectado',
      r2Credentials: 'Credenciais R2',
      sandboxLocal: 'Sandbox Local',
      cloudflareR2: 'Cloudflare R2',
      shortcutHint: 'Ctrl+B Sistema de Arquivos · Ctrl+K Busca · Alt+C Editor',
      lightThemeAria: 'Ativar tema claro',
      darkThemeAria: 'Ativar tema escuro',
      languageLabel: 'Selecionar idioma',
      portugueseOption: 'Português (Brasil)',
      englishOption: 'Inglês (EUA)',
    },
    buckets: {
      bulkDone: 'Operação em lote ({op}) concluída em',
      bulkDeleteOp: 'Exclusão',
      bulkMoveOp: 'Movimentação',
      bulkSummary: '{succeeded} processado(s) com sucesso · {failed} falha(s)',
      bulkFirstError: ' · Primeiro erro: {key} ({reason})',
      dismiss: 'Dispensar',
      title: 'Buckets Cloudflare R2',
      subtitle: 'Selecione um bucket para navegar diretórios virtuais e gerenciar objetos via SDK S3',
      refresh: 'Atualizar',
      newBucket: 'Novo Bucket',
      loadingBuckets: 'Carregando buckets...',
      emptyBuckets: 'Nenhum bucket encontrado. Crie o primeiro bucket para começar.',
      objectsUnit: 'objetos',
      deleteEmptyBucketTitle: 'Excluir bucket vazio',
      folderBreadcrumbsAria: 'Navegação de pastas',
      newFile: 'Novo Arquivo',
      newFolder: 'Nova Pasta',
      uploadFile: 'Enviar Arquivo',
      selectedItems: '{count} item(ns) selecionado(s) em {bucket}',
      bulkMove: 'Mover Selecionados',
      deleteSelected: 'Excluir Selecionados',
      selectAllAria: 'Selecionar todos os itens',
      colNamePrefix: 'Nome / Prefixo',
      colTypeMetadata: 'Tipo / Tags de Metadados',
      colSize: 'Tamanho',
      colModified: 'Modificado',
      colActions: 'Ações',
      loadingDirectory: 'Carregando objetos via Delimiter="/"...',
      emptyDirectory: 'Este diretório está vazio. Crie uma subpasta ou envie arquivos para {bucket}.',
      selectFolderAria: 'Selecionar pasta {name}',
      selectFileAria: 'Selecionar arquivo {name}',
      virtualFolderMarker: 'Diretório virtual · Marcador 0-byte',
      virtualFolderPrefix: 'Diretório virtual · Prefixo S3',
      openFolder: 'Abrir',
      editInCodeEditorTitle: 'Editar no Editor de Código',
      inspectObjectTitle: 'Inspecionar objeto',
      presignTitle: 'Gerar URL Pré-assinada',
      downloadTitle: 'Baixar arquivo',
      openInEditor: 'Abrir no Editor',
      closePanel: 'Fechar Painel',
      presignedTitle: 'URL Pré-assinada (expira em {seconds}s · {time})',
      tagsPrefix: 'Tags',
      createBucketTitle: 'Criar Bucket R2',
      bucketNameLabel: 'Nome do Bucket',
      bucketNamePlaceholder: 'ex: buckets-media-cdn',
      locationHintLabel: 'Região Hint',
      storageClassLabel: 'Classe',
      cancel: 'Cancelar',
      createBucketSubmit: 'Criar Bucket',
      createFolderTitle: 'Nova Pasta Virtual',
      folderPathLabel: 'Nome ou Caminho Relativo (em {prefix})',
      folderPathPlaceholder: 'ex: v2.5/android',
      createMarkerLabel: 'Criar objeto marcador zero-byte (/) para persistir pasta vazia no R2',
      createFolderSubmit: 'Criar Pasta',
      uploadModalTitle: 'Enviar Arquivo para {prefix}',
      metadataKeyLabel: 'Tag Metadado (Key)',
      metadataValLabel: 'Valor da Tag',
      uploading: 'Enviando...',
      uploadSubmit: 'Enviar para R2',
      bulkMoveModalTitle: 'Mover {count} Item(ns) em Lote',
      destBucketLabel: 'Bucket de Destino',
      destPrefixLabel: 'Prefixo de Destino (Opcional)',
      destPrefixPlaceholder: 'ex: archive/2026/',
      overwriteLabel: 'Sobrescrever arquivos existentes no destino',
      confirmMove: 'Confirmar Movimentação',
      deleteFolderTitle: 'Excluir pasta',
      forceDeleteBucketTitle: 'Confirmar Exclusão Completa do Bucket',
      forceDeleteFolderTitle: 'Confirmar Exclusão Completa da Pasta',
      forceDeleteBucketWarning: 'O bucket "{target}" não está vazio. Esta ação excluirá permanentemente o bucket e TODO o seu conteúdo.',
      forceDeleteFolderWarning: 'A pasta "{target}" não está vazia. Esta ação excluirá permanentemente a pasta e TODO o seu conteúdo aninhado.',
      forceDeleteBucketPrompt: 'Digite o nome exato do bucket para confirmar:',
      forceDeleteFolderPrompt: 'Digite o caminho exato da pasta para confirmar:',
      forceDeleteInputPlaceholder: 'Digite exatamente {target}',
      forceDeleteConfirmButton: 'Excluir Tudo Permanentemente',
      deleting: 'Excluindo...',
      bulkDeleteConfirmTitle: 'Confirmar Exclusão em Lote',
      bulkDeleteConfirmBody: 'Deseja excluir permanentemente {count} item(ns) selecionado(s) de {bucket}?',
      bulkDeleteConfirmButton: 'Confirmar Exclusão',
      moving: 'Movendo...',
      moreItems: '+{count} outro(s) item(ns)',
      dropZonePrompt: 'Arraste e solte arquivos do seu computador aqui para enviar à pasta ativa ou sobre qualquer pasta da lista',
      dropOverlayTitle: 'Solte arquivo(s) para enviar para {target}',
      dropFolderHint: 'Soltar em {folder}/',
      uploadingProgress: 'Enviando {completed}/{total}: {file}...',
      dropUploadDone: '{count} arquivo(s) enviado(s) para {target}.',
      uploadModalDropHint: 'Arraste arquivos aqui ou selecione abaixo',
      uploadFilesSelected: '{count} arquivo(s) selecionado(s)',
      locations: {
        ENAM: 'ENAM (América Leste)',
        WNAM: 'WNAM (América Oeste)',
        WEUR: 'WEUR (Europa Oeste)',
        EEUR: 'EEUR (Europa Leste)',
        APAC: 'APAC (Ásia-Pacífico)',
      },
      storageClasses: {
        Standard: 'Standard',
        InfrequentAccess: 'Infrequent Access',
      },
    },
    editor: {
      title: 'Editor de Código & Texto R2',
      subtitle: 'Crie ou edite arquivos .js, .ts, .jsx, .tsx, .json, .yaml/.yml, .toml, .xml, .htm/.html, .css, .md e .txt diretamente no bucket',
      viewEdit: 'Código',
      viewSplit: 'Dividido',
      viewPreview: 'Visualizar',
      autoSaveLabel: 'Auto-Save',
      autoSaveOn: 'Auto-Save: ON',
      autoSaveOff: 'Auto-Save: OFF',
      formatCode: 'Format Code',
      saving: 'Salvando...',
      saveDirty: 'Salvar no R2*',
      saveClean: 'Salvar no R2',
      destBucketLabel: 'Bucket de Destino',
      filePathLabel: 'Caminho / Nome do Arquivo',
      filePathPlaceholder: 'ex: src/handler.ts, wrangler.toml ou docs/guide.md',
      openExistingLabel: 'Abrir Arquivo Existente ({count})',
      selectExistingPlaceholder: 'Selecionar arquivo do bucket...',
      newTemplateLabel: 'Novo modelo:',
      loadingContent: 'Carregando conteúdo do R2...',
      editorAria: 'Editor de código e texto',
      previewHtmlSandbox: 'Visualização HTML (Iframe Sandbox Isolado)',
      previewMarkdown: 'Visualização Markdown',
      previewPrism: 'Prism.js Syntax View ({label})',
      linesUnit: 'linhas',
      autoSaveDisabled: 'Auto-save desativado',
      autoSaveSaving: 'Auto-save salvando...',
      autoSavePending: 'Auto-save em 3s...',
      autoSaveError: 'Erro no auto-save',
      autoSaveSavedAt: 'Auto-salvo às {time}',
      autoSaveReady: 'Auto-save 3s',
      autoSavedNotice: 'Auto-salvo em {bucket}/{key} ({size})',
      manualSavedNotice: 'Salvo em {bucket}/{key} ({size})',
      formatErrorTitle: 'Falha ao Formatar',
      formatErrorFallback: 'Conteúdo inválido para formatação.',
      plainTextLabel: 'Texto Simples',
    },
    search: {
      title: 'Busca Global por Nome e Metadados',
      subtitle: 'Pesquise objetos em todos os buckets R2 por nome de arquivo, caminho completo ou tags x-amz-meta-*',
      nameOrKeyLabel: 'Nome ou Chave',
      nameOrKeyPlaceholder: 'ex: manifest, wrangler, aab...',
      bucketLabel: 'Bucket',
      allBuckets: 'Todos os buckets',
      tagKeyLabel: 'Tag Key',
      tagKeyPlaceholder: 'ex: env',
      tagValueLabel: 'Tag Value',
      tagValuePlaceholder: 'ex: production',
      searchButton: 'Buscar',
      ready: 'Pronto para pesquisar',
      summary: '{matches} resultado(s) em {buckets} bucket(s) · {elapsed} ms',
      colBucketKey: 'Bucket / Chave Completa',
      colMetadata: 'Metadados',
      colMatch: 'Correspondência',
      colSize: 'Tamanho',
      colNavigate: 'Navegar',
      loading: 'Consultando endpoint /api/search...',
      empty: 'Nenhum objeto corresponde aos filtros informados.',
      openFolder: 'Abrir Pasta',
    },
    telemetry: {
      kpiRequests: 'Requisições API & R2',
      kpiUptime: 'Uptime {seconds}s',
      kpiLatency: 'Latência Média / P95',
      kpiServerTimingActive: 'Server-Timing ativo',
      kpiThroughput: 'Throughput Transferido',
      kpiThroughputSub: 'S3 PutObject + GetObject + List',
      kpiErrorRate: 'Taxa de Erros',
      kpiErrorsSub: '{count} falha(s) RFC 7807',
      loadingDashboard: 'Carregando métricas de armazenamento, requisições e custos de egresso R2...',
      storageChartTitle: 'Uso de Armazenamento por Bucket (KB / MB)',
      storageChartSub: 'Volume armazenado em tempo real via endpoint /api/telemetry/metrics',
      emptyBucketsChart: 'Nenhum bucket disponível para gráfico.',
      storageSeriesLabel: 'Armazenamento (KB)',
      objectsSeriesLabel: 'Objetos',
      egressChartTitle: 'Requisições & Comparativo de Custo de Egresso (USD)',
      egressChartSub: 'Cloudflare R2 ($0.00/GB egresso) versus tarifa S3 padrão ($0.09/GB)',
      emptyRequestsChart: 'Nenhuma métrica de requisição disponível.',
      requestsSeriesLabel: 'Requisições',
      s3EgressSeriesLabel: 'Egresso S3 Equivalente ($)',
      r2EgressSeriesLabel: 'Egresso R2 ($0.00)',
      bucketTableTitle: 'Detalhamento por Bucket · Armazenamento, Tráfego e Egresso',
      colBucket: 'Bucket',
      colObjects: 'Objetos',
      colStorageUsage: 'Uso Storage',
      colRequests: 'Requisições',
      colEgress: 'Egresso',
      colR2EgressCost: 'Custo Egresso R2',
      colSavingsVsS3: 'Economia vs S3',
      sinksTitle: 'Pipeline de Logging Centralizado (.NET 10 Serilog + Cloudflare Tail Worker)',
      sinksSubtitle: 'Ative ou configure os destinos de agregação de logs estruturados e telemetria de borda',
      refreshTelemetry: 'Atualizar Telemetria',
      sinkActiveLabel: 'Sink API .NET Ativo',
      tailWorkerLabel: 'Tail Worker R2',
      opsTitle: 'Métricas de Desempenho por Operação R2',
      colOperation: 'Operação SDK / API',
      colCalls: 'Chamadas',
      colErrors: 'Erros',
      colAvgMs: 'Média (ms)',
      colVolume: 'Volume',
      logsTitle: 'Stream de Logs Estruturados (TraceId & Sinks)',
      allLevels: 'Todos os níveis',
      filterPlaceholder: 'Filtrar TraceId, bucket ou mensagem...',
      downloadLogs: 'Download Logs',
      loadingLogs: 'Carregando logs...',
      emptyLogs: 'Nenhum evento encontrado para este filtro.',
      opsChartTitle: 'Contagem de Requisições API por Operação',
      opsChartSub: 'Chamadas SDK/REST e erros registrados na sessão ativa',
      opsCallsSeries: 'Requisições',
      opsErrorsSeries: 'Erros',
      emptyOpsChart: 'Nenhuma operação registrada ainda.',
      totalTrackedStorage: 'Total: {size}',
      totalTrackedRequests: 'Total: {count} req',
    },
    expo: {
      title: 'Simulador Expo Universal TypeScript',
      subtitleSuffix: 'Conectado ao vivo à API REST de Buckets',
      filterPlaceholder: 'Filtrar arquivos...',
      selectedCount: '{count} selecionado(s)',
      deleteAction: 'Excluir',
      emptyDirectory: 'Diretório vazio nesta visualização.',
    },
    wrangler: {
      title: 'Infraestrutura como Código (Wrangler)',
      subtitle: 'Configure bindings R2, Analytics Engine e Tail Worker para deploy automatizado',
      workerNameLabel: 'Nome do Worker',
      environmentLabel: 'Ambiente Deploy',
      enableAnalytics: 'Habilitar Analytics Engine (métricas de latência R2 na borda)',
      enableTailWorker: 'Habilitar Tail Worker Consumer (Seq / ELK / Application Insights)',
      activeBindings: 'Bindings R2 Ativos',
      copied: 'Copiado',
      copyToml: 'Copiar TOML',
    },
    monorepo: {
      title: 'Código-Fonte do Monorepo (.NET 10 · Expo Universal · Wrangler IaC)',
      subtitle: 'Inspecione todos os arquivos gerados, incluindo Serilog, métricas R2, testes xUnit/Jest e Workers',
      filterAll: 'Todos',
      filterDotnet: '.NET 10',
      filterExpo: 'Expo TS',
      filterWrangler: 'Wrangler',
      packaging: 'Empacotando...',
      downloadZip: 'Baixar Monorepo (.zip)',
      copied: 'Copiado',
      copy: 'Copiar',
    },
    drawer: {
      title: 'Conexão Cloudflare R2',
      closeAria: 'Fechar painel de credenciais',
      executionModeLabel: 'Modo de Execução',
      sandboxLocal: 'Sandbox Local',
      cloudflareReal: 'Cloudflare R2 Real',
      sandboxDesc: 'O Sandbox Local simula o SDK oficial S3, diretórios virtuais, busca por tags e operações em lote instantaneamente no servidor.',
      cloudflareDesc: 'Conecta diretamente ao endpoint S3 https://<accountId>.r2.cloudflarestorage.com usando suas chaves da sessão.',
      accountIdLabel: 'Cloudflare Account ID',
      accountIdPlaceholder: 'ex: 8f9c2a1b3d4e5f6a7b8c9d0e1f2a3b4c',
      accessKeyLabel: 'R2 Access Key ID',
      accessKeyPlaceholder: 'Chave de acesso S3 do token R2',
      secretKeyLabel: 'R2 Secret Access Key',
      secretKeyPlaceholder: 'Segredo S3 do token R2',
      apiTokenLabel: 'Cloudflare API Token (Opcional · Admin REST)',
      apiTokenPlaceholder: 'Bearer Token com permissão Workers R2 Storage:Edit',
      securityNote: 'As credenciais permanecem apenas na memória desta sessão e são enviadas por cabeçalho TLS ao backend.',
      validationMissing: 'Informe Account ID, R2 Access Key ID e Secret Access Key para conectar ao Cloudflare R2.',
      cancel: 'Cancelar',
      apply: 'Aplicar Conexão',
    },
    errorBanner: {
      dismissAria: 'Fechar alerta de erro',
      traceLabel: 'Trace',
    },
    errors: {
      operationErrorTitle: 'Erro na operação',
      unexpectedError: 'Ocorreu um erro inesperado ao processar a solicitação.',
      networkFailureTitle: 'Falha de Rede',
      clientErrorTitle: 'Erro do Cliente',
      unknownErrorTitle: 'Erro Desconhecido',
      unknownErrorDetail: 'Não foi possível concluir a operação solicitada.',
      codeMap: {
        BUCKET_NAME_INVALID: 'O nome do bucket deve ter entre 3 e 63 caracteres minúsculos, números ou hífens.',
        BUCKET_ALREADY_EXISTS: 'Já existe um bucket com este nome na conta selecionada.',
        BUCKET_NOT_FOUND: 'O bucket solicitado não foi encontrado.',
        BUCKET_NOT_EMPTY: 'O bucket não está vazio. Confirme o nome do bucket para excluir todo o conteúdo.',
        FOLDER_NOT_EMPTY: 'A pasta não está vazia. Confirme o caminho da pasta para excluir todo o conteúdo.',
        FOLDER_INVALID_NAME: 'Nome de diretório inválido. Evite caracteres especiais ou caminhos relativos.',
        OBJECT_NOT_FOUND: 'O arquivo solicitado não foi localizado no bucket.',
        BULK_PARTIAL_FAILURE: 'Alguns itens não puderam ser processados na operação em lote.',
        BULK_DESTINATION_CONFLICT: 'Já existe um arquivo com o mesmo nome no destino e a sobrescrita está desativada.',
        CLOUDFLARE_AUTH_FAILED: 'Falha de autenticação com as credenciais Cloudflare R2 fornecidas.',
        CLOUDFLARE_ENDPOINT_ERROR: 'Não foi possível comunicar com o endpoint S3 do Cloudflare R2.',
        UPLOAD_FILE_REQUIRED: 'Selecione ou arraste pelo menos um arquivo para enviar.',
        NETWORK_UNREACHABLE: 'Falha de conexão com a API. Verifique se o servidor está acessível.',
      },
      invalidJsonPrefix: 'JSON inválido: {message}',
      invalidJsonGeneric: 'JSON inválido.',
      xmlWarning: 'Aviso XML: nenhuma tag de fechamento detectada.',
      tomlBracketWarning: "Aviso TOML (linha {line}): cabeçalho de seção sem fechamento ']'.",
      tomlKeyValueWarning: 'Aviso TOML (linha {line}): esperado formato chave = valor.',
    },
  },
  'en-US': {
    nav: {
      buckets: 'File System',
      editor: 'Code Editor',
      search: 'Global Search',
      telemetry: 'Observability',
      expo: 'Expo Universal',
      wrangler: 'Infrastructure',
      monorepo: 'Repository',
    },
    shell: {
      brand: 'Cloudflare Buckets',
      r2Connected: 'R2 Connected',
      r2Credentials: 'R2 Credentials',
      sandboxLocal: 'Local Sandbox',
      cloudflareR2: 'Cloudflare R2',
      shortcutHint: 'Ctrl+B File System · Ctrl+K Search · Alt+C Editor',
      lightThemeAria: 'Switch to light theme',
      darkThemeAria: 'Switch to dark theme',
      languageLabel: 'Select language',
      portugueseOption: 'Portuguese (Brazil)',
      englishOption: 'English (USA)',
    },
    buckets: {
      bulkDone: 'Bulk {op} completed in',
      bulkDeleteOp: 'Delete',
      bulkMoveOp: 'Move',
      bulkSummary: '{succeeded} succeeded · {failed} failed',
      bulkFirstError: ' · First error: {key} ({reason})',
      dismiss: 'Dismiss',
      title: 'Cloudflare R2 Buckets',
      subtitle: 'Select a bucket to browse virtual directories and manage objects via the S3 SDK',
      refresh: 'Refresh',
      newBucket: 'New Bucket',
      loadingBuckets: 'Loading buckets...',
      emptyBuckets: 'No buckets found. Create your first bucket to get started.',
      objectsUnit: 'objects',
      deleteEmptyBucketTitle: 'Delete empty bucket',
      folderBreadcrumbsAria: 'Folder breadcrumbs',
      newFile: 'New File',
      newFolder: 'New Folder',
      uploadFile: 'Upload File',
      selectedItems: '{count} item(s) selected in {bucket}',
      bulkMove: 'Move Selected',
      deleteSelected: 'Delete Selected',
      selectAllAria: 'Select all items',
      colNamePrefix: 'Name / Prefix',
      colTypeMetadata: 'Content Type / Metadata Tags',
      colSize: 'Size',
      colModified: 'Modified',
      colActions: 'Actions',
      loadingDirectory: 'Loading objects with Delimiter="/"...',
      emptyDirectory: 'This directory is empty. Create a subfolder or upload files to {bucket}.',
      selectFolderAria: 'Select folder {name}',
      selectFileAria: 'Select file {name}',
      virtualFolderMarker: 'Virtual folder · 0-byte marker',
      virtualFolderPrefix: 'Virtual folder · S3 prefix',
      openFolder: 'Open',
      editInCodeEditorTitle: 'Edit in Code Editor',
      inspectObjectTitle: 'Inspect object',
      presignTitle: 'Generate Presigned URL',
      downloadTitle: 'Download file',
      openInEditor: 'Open in Editor',
      closePanel: 'Close Panel',
      presignedTitle: 'Presigned URL (expires in {seconds}s · {time})',
      tagsPrefix: 'Tags',
      createBucketTitle: 'Create R2 Bucket',
      bucketNameLabel: 'Bucket Name',
      bucketNamePlaceholder: 'e.g. buckets-media-cdn',
      locationHintLabel: 'Location Hint',
      storageClassLabel: 'Storage Class',
      cancel: 'Cancel',
      createBucketSubmit: 'Create Bucket',
      createFolderTitle: 'New Virtual Folder',
      folderPathLabel: 'Name or Relative Path (inside {prefix})',
      folderPathPlaceholder: 'e.g. v2.5/android',
      createMarkerLabel: 'Create zero-byte marker object (/) to persist empty folder in R2',
      createFolderSubmit: 'Create Folder',
      uploadModalTitle: 'Upload File to {prefix}',
      metadataKeyLabel: 'Metadata Tag (Key)',
      metadataValLabel: 'Tag Value',
      uploading: 'Uploading...',
      uploadSubmit: 'Upload to R2',
      bulkMoveModalTitle: 'Bulk Move {count} Item(s)',
      destBucketLabel: 'Destination Bucket',
      destPrefixLabel: 'Destination Prefix (Optional)',
      destPrefixPlaceholder: 'e.g. archive/2026/',
      overwriteLabel: 'Overwrite existing objects at destination',
      confirmMove: 'Confirm Move',
      deleteFolderTitle: 'Delete folder',
      forceDeleteBucketTitle: 'Confirm Full Bucket Deletion',
      forceDeleteFolderTitle: 'Confirm Full Folder Deletion',
      forceDeleteBucketWarning: 'Bucket "{target}" is not empty. This action will permanently delete the bucket and ALL of its contents.',
      forceDeleteFolderWarning: 'Folder "{target}" is not empty. This action will permanently delete the folder and ALL nested files and subfolders.',
      forceDeleteBucketPrompt: 'Type the exact bucket name to confirm:',
      forceDeleteFolderPrompt: 'Type the exact folder path to confirm:',
      forceDeleteInputPlaceholder: 'Type exactly {target}',
      forceDeleteConfirmButton: 'Delete Everything Permanently',
      deleting: 'Deleting...',
      bulkDeleteConfirmTitle: 'Confirm Batch Deletion',
      bulkDeleteConfirmBody: 'Permanently delete {count} selected item(s) from {bucket}?',
      bulkDeleteConfirmButton: 'Confirm Delete',
      moving: 'Moving...',
      moreItems: '+{count} more item(s)',
      dropZonePrompt: 'Drag and drop files from your computer here to upload into the active folder or onto any folder row above',
      dropOverlayTitle: 'Drop file(s) to upload to {target}',
      dropFolderHint: 'Drop into {folder}/',
      uploadingProgress: 'Uploading {completed}/{total}: {file}...',
      dropUploadDone: '{count} file(s) uploaded to {target}.',
      uploadModalDropHint: 'Drag files here or select below',
      uploadFilesSelected: '{count} file(s) selected',
      locations: {
        ENAM: 'ENAM (Eastern North America)',
        WNAM: 'WNAM (Western North America)',
        WEUR: 'WEUR (Western Europe)',
        EEUR: 'EEUR (Eastern Europe)',
        APAC: 'APAC (Asia-Pacific)',
      },
      storageClasses: {
        Standard: 'Standard',
        InfrequentAccess: 'Infrequent Access',
      },
    },
    editor: {
      title: 'R2 Code & Text Editor',
      subtitle: 'Create or edit .js, .ts, .jsx, .tsx, .json, .yaml/.yml, .toml, .xml, .htm/.html, .css, .md, and .txt files directly in R2',
      viewEdit: 'Code',
      viewSplit: 'Split',
      viewPreview: 'Preview',
      autoSaveLabel: 'Auto-Save',
      autoSaveOn: 'Auto-Save: ON',
      autoSaveOff: 'Auto-Save: OFF',
      formatCode: 'Format Code',
      saving: 'Saving...',
      saveDirty: 'Save to R2*',
      saveClean: 'Save to R2',
      destBucketLabel: 'Target Bucket',
      filePathLabel: 'File Path / Name',
      filePathPlaceholder: 'e.g. src/handler.ts, wrangler.toml, or docs/guide.md',
      openExistingLabel: 'Open Existing File ({count})',
      selectExistingPlaceholder: 'Select file from bucket...',
      newTemplateLabel: 'New template:',
      loadingContent: 'Loading content from R2...',
      editorAria: 'Code and text editor',
      previewHtmlSandbox: 'HTML Preview (Isolated Sandbox Iframe)',
      previewMarkdown: 'Markdown Preview',
      previewPrism: 'Prism.js Syntax View ({label})',
      linesUnit: 'lines',
      autoSaveDisabled: 'Auto-save disabled',
      autoSaveSaving: 'Auto-saving...',
      autoSavePending: 'Auto-saving in 3s...',
      autoSaveError: 'Auto-save error',
      autoSaveSavedAt: 'Auto-saved at {time}',
      autoSaveReady: 'Auto-save 3s',
      autoSavedNotice: 'Auto-saved to {bucket}/{key} ({size})',
      manualSavedNotice: 'Saved to {bucket}/{key} ({size})',
      formatErrorTitle: 'Format Failed',
      formatErrorFallback: 'Invalid content for formatting.',
      plainTextLabel: 'Plain Text',
    },
    search: {
      title: 'Global Search by Name & Metadata',
      subtitle: 'Search objects across all R2 buckets by filename, full key, or x-amz-meta-* metadata tags',
      nameOrKeyLabel: 'Name or Key',
      nameOrKeyPlaceholder: 'e.g. manifest, wrangler, aab...',
      bucketLabel: 'Bucket',
      allBuckets: 'All buckets',
      tagKeyLabel: 'Tag Key',
      tagKeyPlaceholder: 'e.g. env',
      tagValueLabel: 'Tag Value',
      tagValuePlaceholder: 'e.g. production',
      searchButton: 'Search',
      ready: 'Ready to search',
      summary: '{matches} match(es) across {buckets} bucket(s) · {elapsed} ms',
      colBucketKey: 'Bucket / Full Key',
      colMetadata: 'Metadata',
      colMatch: 'Matched On',
      colSize: 'Size',
      colNavigate: 'Navigate',
      loading: 'Querying /api/search endpoint...',
      empty: 'No objects match the specified filters.',
      openFolder: 'Open Folder',
    },
    telemetry: {
      kpiRequests: 'API & R2 Requests',
      kpiUptime: 'Uptime {seconds}s',
      kpiLatency: 'Avg / P95 Latency',
      kpiServerTimingActive: 'Server-Timing active',
      kpiThroughput: 'Transferred Throughput',
      kpiThroughputSub: 'S3 PutObject + GetObject + List',
      kpiErrorRate: 'Error Rate',
      kpiErrorsSub: '{count} RFC 7807 failure(s)',
      loadingDashboard: 'Loading R2 storage, request, and egress cost metrics...',
      storageChartTitle: 'Storage Usage by Bucket (KB / MB)',
      storageChartSub: 'Real-time storage volume via /api/telemetry/metrics',
      emptyBucketsChart: 'No buckets available for charting.',
      storageSeriesLabel: 'Storage (KB)',
      objectsSeriesLabel: 'Objects',
      egressChartTitle: 'Requests & Egress Cost Comparison (USD)',
      egressChartSub: 'Cloudflare R2 ($0.00/GB egress) vs standard S3 egress ($0.09/GB)',
      emptyRequestsChart: 'No request metrics available.',
      requestsSeriesLabel: 'Requests',
      s3EgressSeriesLabel: 'Equivalent S3 Egress ($)',
      r2EgressSeriesLabel: 'R2 Egress ($0.00)',
      bucketTableTitle: 'Per-Bucket Breakdown · Storage, Traffic & Egress',
      colBucket: 'Bucket',
      colObjects: 'Objects',
      colStorageUsage: 'Storage Usage',
      colRequests: 'Requests',
      colEgress: 'Egress',
      colR2EgressCost: 'R2 Egress Cost',
      colSavingsVsS3: 'Savings vs S3',
      sinksTitle: 'Centralized Logging Pipeline (.NET 10 Serilog + Cloudflare Tail Worker)',
      sinksSubtitle: 'Enable or configure structured log aggregation sinks and edge telemetry',
      refreshTelemetry: 'Refresh Telemetry',
      sinkActiveLabel: '.NET API Sink Active',
      tailWorkerLabel: 'R2 Tail Worker',
      opsTitle: 'Performance Metrics by R2 Operation',
      colOperation: 'SDK / API Operation',
      colCalls: 'Calls',
      colErrors: 'Errors',
      colAvgMs: 'Avg (ms)',
      colVolume: 'Volume',
      logsTitle: 'Structured Log Stream (TraceId & Sinks)',
      allLevels: 'All levels',
      filterPlaceholder: 'Filter TraceId, bucket, or message...',
      downloadLogs: 'Download Logs',
      loadingLogs: 'Loading logs...',
      emptyLogs: 'No events matched this filter.',
      opsChartTitle: 'API Request Counts by Operation',
      opsChartSub: 'SDK/REST call volume and errors recorded in the active session',
      opsCallsSeries: 'Requests',
      opsErrorsSeries: 'Errors',
      emptyOpsChart: 'No API operations recorded yet.',
      totalTrackedStorage: 'Total: {size}',
      totalTrackedRequests: 'Total: {count} req',
    },
    expo: {
      title: 'Expo Universal TypeScript Simulator',
      subtitleSuffix: 'Live connected to Buckets REST API',
      filterPlaceholder: 'Filter files...',
      selectedCount: '{count} selected',
      deleteAction: 'Delete',
      emptyDirectory: 'Empty directory in this view.',
    },
    wrangler: {
      title: 'Infrastructure as Code (Wrangler)',
      subtitle: 'Configure R2 bindings, Analytics Engine, and Tail Worker for automated deployment',
      workerNameLabel: 'Worker Name',
      environmentLabel: 'Deploy Environment',
      enableAnalytics: 'Enable Analytics Engine (edge R2 latency metrics)',
      enableTailWorker: 'Enable Tail Worker Consumer (Seq / ELK / Application Insights)',
      activeBindings: 'Active R2 Bindings',
      copied: 'Copied',
      copyToml: 'Copy TOML',
    },
    monorepo: {
      title: 'Monorepo Source Code (.NET 10 · Expo Universal · Wrangler IaC)',
      subtitle: 'Inspect all generated files including Serilog, R2 metrics, xUnit/Jest tests, and Workers',
      filterAll: 'All',
      filterDotnet: '.NET 10',
      filterExpo: 'Expo TS',
      filterWrangler: 'Wrangler',
      packaging: 'Packaging...',
      downloadZip: 'Download Monorepo (.zip)',
      copied: 'Copied',
      copy: 'Copy',
    },
    drawer: {
      title: 'Cloudflare R2 Connection',
      closeAria: 'Close credentials drawer',
      executionModeLabel: 'Execution Mode',
      sandboxLocal: 'Local Sandbox',
      cloudflareReal: 'Live Cloudflare R2',
      sandboxDesc: 'Local Sandbox simulates the official S3 SDK, virtual directories, metadata search, and bulk operations instantly on the server.',
      cloudflareDesc: 'Connects directly to https://<accountId>.r2.cloudflarestorage.com using your session credentials.',
      accountIdLabel: 'Cloudflare Account ID',
      accountIdPlaceholder: 'e.g. 8f9c2a1b3d4e5f6a7b8c9d0e1f2a3b4c',
      accessKeyLabel: 'R2 Access Key ID',
      accessKeyPlaceholder: 'R2 token S3 access key ID',
      secretKeyLabel: 'R2 Secret Access Key',
      secretKeyPlaceholder: 'R2 token S3 secret access key',
      apiTokenLabel: 'Cloudflare API Token (Optional · Admin REST)',
      apiTokenPlaceholder: 'Bearer Token with Workers R2 Storage:Edit scope',
      securityNote: 'Credentials stay in session memory only and are forwarded over TLS headers to the backend.',
      validationMissing: 'Provide Account ID, R2 Access Key ID, and Secret Access Key to connect to Cloudflare R2.',
      cancel: 'Cancel',
      apply: 'Apply Connection',
    },
    errorBanner: {
      dismissAria: 'Dismiss error banner',
      traceLabel: 'Trace',
    },
    errors: {
      operationErrorTitle: 'Operation Error',
      unexpectedError: 'An unexpected error occurred while processing the request.',
      networkFailureTitle: 'Network Error',
      clientErrorTitle: 'Client Error',
      unknownErrorTitle: 'Unknown Error',
      unknownErrorDetail: 'Could not complete the requested operation.',
      codeMap: {
        BUCKET_NAME_INVALID: 'Bucket name must be 3-63 lowercase letters, numbers, or hyphens.',
        BUCKET_ALREADY_EXISTS: 'A bucket with this name already exists in the selected account.',
        BUCKET_NOT_FOUND: 'The requested bucket was not found.',
        BUCKET_NOT_EMPTY: 'The bucket is not empty. Confirm the bucket name to delete all contents.',
        FOLDER_NOT_EMPTY: 'The folder is not empty. Confirm the folder path to delete all contents.',
        FOLDER_INVALID_NAME: 'Invalid directory name. Avoid special characters or relative path segments.',
        OBJECT_NOT_FOUND: 'The requested file was not found in the bucket.',
        BULK_PARTIAL_FAILURE: 'Some items could not be processed during the bulk operation.',
        BULK_DESTINATION_CONFLICT: 'A file with the same name already exists at the destination and overwrite is disabled.',
        CLOUDFLARE_AUTH_FAILED: 'Authentication failed with the provided Cloudflare R2 credentials.',
        CLOUDFLARE_ENDPOINT_ERROR: 'Could not reach the Cloudflare R2 S3 endpoint.',
        UPLOAD_FILE_REQUIRED: 'Select or attach at least one file to upload.',
        NETWORK_UNREACHABLE: 'API connection failed. Verify that the server is reachable.',
      },
      invalidJsonPrefix: 'Invalid JSON: {message}',
      invalidJsonGeneric: 'Invalid JSON.',
      xmlWarning: 'XML Warning: no closing tag detected.',
      tomlBracketWarning: "TOML Warning (line {line}): unclosed '[' section header.",
      tomlKeyValueWarning: 'TOML Warning (line {line}): expected key = value format.',
    },
  },
};

export function getTranslation(locale: AppLocale = getActiveLocale()): TranslationCatalog {
  return TRANSLATIONS[locale];
}
