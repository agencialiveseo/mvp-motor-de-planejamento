# 🧠 Regras de Negócio: Algoritmo de Planejamento Automático

O planejamento automático do esquadrão é processado mensalmente, fatiando demandas complexas em entregas diárias e tentando emparelha-las otimizadamente à capacidade real e às restrições temporais dos Pilots.

Abaixo estão estabalecidas as **Regras de Negócio (v4)** validadas e em produção:

---

## 1. Calendário e Capacidade Base
- **Dias Úteis:** O planejamento atua estritamente em dias úteis (segunda a sexta-feira). Finais de semana (sábados e domingos) recebem carga nula [(0 UP)](file:///c:/Users/LENOVO/Desktop/Planejamento/src/App.tsx#24-147).
- **Unidade de Produção (UP):** O motor lê diretamente o peso da tarefa inserido pelo Engenheiro (geralmente extraído do CSV) ou calculado via tabelas constantes internas.
- **Capacidade Mensal (Meta):** O poder total de absorção de um Pilot naquele mês exato equivale a `= (Meta UP Diária do Pilot) × (Número de Dias Úteis)`.

## 2. Direcionamento Semanal (Restrição Temporal)
A regra mais autoritária de prioridade não é o tamanho do cliente, e sim sua **janela temporal**:
- Demais podem conter a indicação de uma **Semana Preferencial** (ex: `semana_1`, `semana_4`, `ultima_semana`).
- **Prioridade Absoluta:** O motor executa rodadas separadas. Todos os itens "Direcionais" são agendados cirurgicamente primeiro. Os itens "Livres" apenas aproveitam as sobras de tempo (buracos na agenda).
- **Atrelamento de Limite Semanal:** A capacidade de uma janela semanal é finita e calculada com base na meta. Demandas direcionadas disputam esse teto no modo *Primeiro a Chegar, Primeiro a Ocupar*.
- **Atraso Restrito (Missed Directional):** Se houver superlotação de demandas direcionadas para uma mesma semana num pilot que eleve o teto estipulado, esse item "transborda". O algoritmo o empurra na agenda para depois, mas marca-o de imediato como **Atrasado** (identificável visualmente em vermelho e na métrica final de acompanhamento). Importante: um item só cai pra frente; ele nunca é adiantado no calendário desrespeitando o fluxo natural de recebimento de material.

## 3. O Teto Diário de Trabalho (Cap de Segurança / Water-filling)
Independentemente do quanto uma entrega atrasou ou concentrou urgência, proteções contra fadiga agem como comportas intransponíveis para cada indivíduo:
- **Teto Rigoroso:** O sistema não permite alocar mais que `= (Meta UP Diária) + 2 UPs` para nenhum Pilot num único dia.
- Se uma tarefa pesada ou um somatório de pequenas estourar esse teto durante o empilhamento das variáveis da semana, o motor interrompe a locação ali mesmo e empurra a "ração restante" ou a próxima demanda estritamente para o próximo dia livre válido do cara. (Técnica "Water-filling").

## 4. Preservação de Fim de Mês: A "Semana Livre"
- Historicamente, busca-se deixar os últimos 5 dias do mês levemente abrandados (foco na qualidade técnica das conclusões e reuniões).
- Para itens e espaços *Livres* (não direcionados rigidamente ao fim do mês), tenta-se preencher de frente pra trás e distribuir esparsamente apenas *60% da carga diária normal* na semana derradeira, caso o mês possua folga sistêmica pra abrutalhar os inícios de semanas antes.
- Se a conta de "UPs x Capacidade" geral estiver bem no osso, todos os limites abrandados do fim do mês perdem a proteção e o Pilot terá que trabalhar todo o mês alocado no talo (gerando um aviso de Warning na tela).

## 5. Múltiplos Pilots Preferenciais e Redirecionamento (Spillover)
As alocações respeitam primariamente os Pilots selecionados e indicados pelo planejamento do Engenheiro, o motor aceita que se marque até **4 opções simultâneas** de preferência num item.
- Ele tenta alocar no `Pilot 1`. Esgotou os dias ou teto até o final do prazo/mês inteiro?
- Continua tentando alocar as sobras no `Pilot 2` do set... e o ciclo se repete.
- **Redirecionamento Global:** E se mesmo entre todos os preferidos do time não sobrar tempo na somatória do mês? Ele faz um *Spillover Extremo*: caça dentro do Esquadrão inteiro não filtrado, verificando quem possui a maior taxa de ociosidade e despeja lá as urgências. Tudo transbordado recebe uma etiqueta laranja `↩ REDIRECIONADO`.

## 6. Regime "Excess Mode" (Saturação Sistêmica Global)
- Se a Demanda global solicitada for maior que `Soma das capacidades do Esquadrão = Estouro Geral`.
- Nestes casos de excesso grave, as lógicas preferenciais caem e o motor tenta distribuir tudo da forma mais igualitária até todo mundo estourar nos limites máximos da regra de "Teto de Segurança Diário".
- O saldo final não absorvido simplesmente exibe num "Warning de Excesso x UPs Inalcançáveis".

## 7. Exportação e Gestão Autônoma do Pilot
O acompanhamento do resultado final opera sem infraestrutura de banco de dados, alavancando as planilhas dos Pilots.
- O algoritmo cospe (via pacote zip) um artefato de Excel (`.xlsx`) unitário desenhado perfeitamente pro **Painel de Controle Individual** dos Pilots.
- O Painel não empurra "Data da entrega", mas injeta Fórmulas dinâmicas. Funciona lendo uma validação de lista na coluna que checa se o pilot marcou como *Pendente* ou *Feito*.
- O Excel devolve na hora 2 métricas ouro via divisões sobre a grade de Dias Úteis: **"UP planejadas/dia mensais"** VS **"UP Entregues/dia mensais"**. Base métrica pra sua remuneração extra do mês!
