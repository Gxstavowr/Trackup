import type { Metadata } from "next";
import Link from "next/link";
import { CONTROLLER, REQUEST_RESPONSE_DAYS } from "@/lib/legal/documents";
import { LegalHeader, LegalSection } from "../legal-ui";

export const metadata: Metadata = { title: "Política de Privacidade · Trackly" };

/**
 * Política de Privacidade (LGPD art. 9º — informação clara sobre o tratamento). Mantida em
 * sincronia com o inventário de dados de `docs/lgpd.md`: ao mudar um, mude o outro e suba
 * `LEGAL_VERSION` em `lib/legal/documents.ts`.
 */
export default function PrivacyPolicyPage() {
  return (
    <article>
      <LegalHeader
        title="Política de Privacidade"
        intro="Como o Trackly coleta, usa, guarda e compartilha dados pessoais — e como você exerce seus direitos pela Lei Geral de Proteção de Dados (Lei 13.709/2018)."
      />

      <LegalSection title="1. Quem é responsável pelos seus dados">
        <p>
          O Trackly é operado por <strong>{CONTROLLER.legalName}</strong>, CNPJ {CONTROLLER.cnpj},{" "}
          {CONTROLLER.address}. Os papéis são diferentes conforme o tipo de usuário:
        </p>
        <ul>
          <li>
            <strong>Profissionais (coaches):</strong> o Trackly é o <strong>controlador</strong> dos
            dados da sua conta (nome, e-mail, login, dados de cobrança).
          </li>
          <li>
            <strong>Alunos:</strong> o <strong>profissional que convidou você</strong> é o
            controlador dos seus dados de acompanhamento — é ele quem decide o que coletar. O
            Trackly atua como <strong>operador</strong>, tratando esses dados apenas conforme as
            instruções do profissional e esta política.
          </li>
        </ul>
        <p>
          Encarregado de proteção de dados (DPO): {CONTROLLER.dpoName} —{" "}
          <strong>{CONTROLLER.dpoEmail}</strong>.
        </p>
      </LegalSection>

      <LegalSection title="2. Quais dados coletamos e por quê">
        <ul>
          <li>
            <strong>Cadastro e acesso</strong> (nome, e-mail, senha criptografada, telefone):
            criar e proteger sua conta. Base legal: execução de contrato (art. 7º, V).
          </li>
          <li>
            <strong>Perfil do aluno</strong> (idade, sexo, altura, objetivo): personalizar o
            acompanhamento. Base legal: execução de contrato (art. 7º, V).
          </li>
          <li>
            <strong>Dados de saúde — dados sensíveis</strong> (peso, medidas, fotos corporais,
            alimentação, treinos, sono, energia, fome, respostas de check-in e anotações do
            profissional): acompanhar sua evolução. Base legal:{" "}
            <strong>consentimento específico e destacado</strong> (art. 11, I), pedido no seu
            primeiro acesso e revogável a qualquer momento.
          </li>
          <li>
            <strong>Pagamentos</strong> (valores, vencimentos, status): controle financeiro do
            profissional. Base legal: execução de contrato e obrigação legal (art. 7º, II e V).
            O Trackly não armazena número de cartão.
          </li>
          <li>
            <strong>Registros técnicos</strong> (IP, data/hora de acesso, navegador): segurança
            e cumprimento do Marco Civil da Internet (Lei 12.965/2014, art. 15). Base legal:
            obrigação legal (art. 7º, II).
          </li>
        </ul>
        <p>
          Não usamos seus dados para publicidade, não os vendemos e não fazemos perfis
          automatizados que gerem decisões sobre você.
        </p>
      </LegalSection>

      <LegalSection title="3. Onde ficam e como protegemos">
        <ul>
          <li>Banco de dados, autenticação e arquivos ficam na infraestrutura do Supabase.</li>
          <li>
            Cada conta é isolada no próprio banco (Row Level Security): um profissional nunca
            enxerga alunos de outro.
          </li>
          <li>
            Fotos ficam em armazenamento <strong>privado</strong>, acessíveis só por links
            temporários que expiram em minutos.
          </li>
          <li>Todo tráfego é criptografado (HTTPS); senhas são guardadas apenas como hash.</li>
          <li>
            Usamos só cookies <strong>essenciais</strong> de sessão (login). Não há cookies de
            análise ou publicidade.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Com quem compartilhamos">
        <p>Apenas com prestadores necessários para o serviço funcionar (suboperadores):</p>
        <ul>
          <li>
            <strong>Supabase Inc.</strong> — banco de dados, autenticação, armazenamento de
            fotos e envio de e-mails de acesso.
          </li>
          <li>
            <strong>[PROVEDOR DE HOSPEDAGEM DO APP]</strong> — execução da aplicação web.
          </li>
        </ul>
        <p>
          <strong>Transferência internacional:</strong> [INFORMAR A REGIÃO DO PROJETO SUPABASE E
          DA HOSPEDAGEM]. Quando houver tratamento fora do Brasil, ele ocorre com fornecedores
          que oferecem garantias contratuais de proteção (art. 33, II).
        </p>
        <p>Também podemos fornecer dados a autoridades quando exigido por lei ou ordem judicial.</p>
      </LegalSection>

      <LegalSection title="5. Por quanto tempo guardamos">
        <ul>
          <li>Enquanto sua conta ou acompanhamento estiver ativo.</li>
          <li>
            Após pedido de exclusão, os dados são apagados em até {REQUEST_RESPONSE_DAYS} dias.
            Cópias de segurança são sobrescritas automaticamente no ciclo do provedor.
          </li>
          <li>Registros de acesso: 6 meses (Marco Civil da Internet, art. 15).</li>
          <li>
            Registros de consentimento e de pedidos de titulares: 5 anos, apenas para comprovar
            o cumprimento da LGPD (art. 16, I) — sem os dados de saúde.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="6. Seus direitos">
        <p>Pela LGPD (art. 18) você pode, a qualquer momento:</p>
        <ul>
          <li>confirmar se tratamos seus dados e acessá-los;</li>
          <li>corrigir dados incompletos ou desatualizados;</li>
          <li>pedir a exclusão dos dados tratados com base no seu consentimento;</li>
          <li>baixar seus dados em formato estruturado (portabilidade);</li>
          <li>revogar o consentimento e saber as consequências disso;</li>
          <li>saber com quem seus dados são compartilhados.</li>
        </ul>
        <p>
          <strong>Alunos:</strong> use a tela <strong>Privacidade</strong> no portal — lá você
          baixa seus dados na hora e registra pedidos, que seu profissional responde em até{" "}
          {REQUEST_RESPONSE_DAYS} dias. <strong>Profissionais:</strong> use{" "}
          <strong>Configurações › Privacidade</strong>. Em qualquer caso, você também pode
          escrever para {CONTROLLER.dpoEmail} ou reclamar à ANPD (gov.br/anpd).
        </p>
        <p>
          Revogar o consentimento de dados de saúde interrompe o acompanhamento pelo app, pois
          ele depende desses dados.
        </p>
      </LegalSection>

      <LegalSection title="7. Menores de idade">
        <p>
          O Trackly é destinado a maiores de 18 anos. O acompanhamento de menores exige o
          consentimento de um dos pais ou responsável legal (art. 14), obtido diretamente pelo
          profissional antes do cadastro.
        </p>
      </LegalSection>

      <LegalSection title="8. Incidentes de segurança">
        <p>
          Se ocorrer um incidente que possa trazer risco a você, comunicaremos os afetados e a
          ANPD em prazo razoável, conforme o art. 48 da LGPD.
        </p>
      </LegalSection>

      <LegalSection title="9. Alterações">
        <p>
          Quando esta política mudar de forma relevante, você verá a nova versão e precisará
          confirmá-la no próximo acesso. Veja também os{" "}
          <Link href="/termos" className="text-brand hover:underline">
            Termos de Uso
          </Link>
          .
        </p>
      </LegalSection>
    </article>
  );
}
