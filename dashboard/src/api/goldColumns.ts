/** Nomes de colunas das tabelas Gold consumidas pelo front-end. */
export const GOLD_COLUMNS = {
  SALDO: 'saldo',
  ADMISSOES: 'admissoes',
  DESLIGAMENTOS: 'desligamentos',
  COMPETENCIA: 'competencia',
  UF: 'uf',
  MUNICIPIO: 'municipio',
  SECAO: 'secao',
  CBO_OCUPACAO: 'cbo2002ocupacao',
  SEXO: 'sexo',
  FAIXA_ETARIA: 'faixa_etaria',
  GRAUDEINSTRUCAO: 'graudeinstrucao',
  MOVIMENTO: 'movimento',
  SALARIO_MEDIO: 'salario_medio',
  SALARIO_MEDIANO: 'salario_mediano',
  SALARIO_P25: 'salario_p25',
  SALARIO_P75: 'salario_p75',
  SALARIO_MIN: 'salario_min',
  SALARIO_MAX: 'salario_max',
  N_SALARIOS_VALIDOS: 'n_salarios_validos',
} as const

export type GoldColumnName = (typeof GOLD_COLUMNS)[keyof typeof GOLD_COLUMNS]
