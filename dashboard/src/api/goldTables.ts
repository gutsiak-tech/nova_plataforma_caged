/** Base names aceitos por `GET /api/gold/v1/table/{base_name}` (sufixo _pr/_rmc via scope). */
export const GOLD_TABLES = {
  MUNICIPIO: 'tabela_municipio',
  UF: 'tabela_uf',
  SETOR: 'tabela_setor',
  OCUPACAO: 'tabela_ocupacao',
  PERFIL_SEXO_FAIXA_ETARIA: 'tabela_perfil_sexo_faixa_etaria',
  PERFIL_SEXO_INSTRUCAO: 'tabela_perfil_sexo_instrucao',
  PERFIL_FAIXA_ETARIA_INSTRUCAO: 'tabela_perfil_faixa_etaria_instrucao',
  PERFIL_SEXO_SALARIO: 'tabela_perfil_sexo_salario',
  PERFIL_FAIXA_ETARIA_SALARIO: 'tabela_perfil_faixa_etaria_salario',
  PERFIL_GRAUDEINSTRUCAO_SALARIO: 'tabela_perfil_graudeinstrucao_salario',
  PERFIL_SEXO_FAIXA_ETARIA_SALARIO: 'tabela_perfil_sexo_faixa_etaria_salario',
  PERFIL_SEXO_INSTRUCAO_SALARIO: 'tabela_perfil_sexo_instrucao_salario',
  PERFIL_FAIXA_ETARIA_INSTRUCAO_SALARIO: 'tabela_perfil_faixa_etaria_instrucao_salario',
} as const

export type GoldTableName = (typeof GOLD_TABLES)[keyof typeof GOLD_TABLES]
