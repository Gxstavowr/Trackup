import type { Metadata } from "next";
import Link from "next/link";
import { CONTROLLER, REQUEST_RESPONSE_DAYS } from "@/lib/legal/documents";
import { LegalHeader, LegalSection } from "../legal-ui";

export const metadata: Metadata = { title: "Termos de Uso · Trackly" };

/**
 * Termos de Uso — a seção 3 funciona como o acordo de tratamento de dados (DPA) entre o coach
 * (controlador dos dados dos alunos) e o Trackly (operador), exigido pelo art. 39 da LGPD.
 */
export default function TermsPage() {
  return (
    <article>
      <LegalHeader
        title="Termos de Uso"
        intro="Regras de uso do Trackly por profissionais de acompanhamento físico e nutricional e por seus alunos."
      />

      <LegalSection title="1. O serviço">
        <p>
          O Trackly ({CONTROLLER.legalName}, CNPJ {CONTROLLER.cnpj}) é uma plataforma para
          profissionais acompanharem alunos por meio de check-ins, planos de treino e nutrição,
          métricas, fotos de evolução e controle de pagamentos. O Trackly não presta serviço de
          saúde e não substitui avaliação profissional.
        </p>
      </LegalSection>

      <LegalSection title="2. Conta e responsabilidades do profissional">
        <ul>
          <li>Manter seus dados de acesso em sigilo e informar uso indevido da conta.</li>
          <li>Cadastrar apenas alunos com quem mantém relação profissional real.</li>
          <li>Não cadastrar menores de 18 anos sem o consentimento do responsável legal.</li>
          <li>Usar os dados dos alunos somente para o acompanhamento contratado.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Tratamento dos dados dos alunos (acordo controlador–operador)">
        <p>
          Em relação aos dados dos seus alunos, <strong>você é o controlador</strong> e o
          Trackly é o <strong>operador</strong> (LGPD art. 5º, VI e VII). Ao aceitar estes
          termos, as partes concordam que:
        </p>
        <ul>
          <li>
            O Trackly trata os dados dos alunos apenas para prestar o serviço, conforme suas
            instruções, e nunca para finalidade própria, publicidade ou venda.
          </li>
          <li>
            O Trackly coleta e registra, em nome do profissional, o consentimento do aluno para
            dados de saúde e oferece ao aluno ferramentas para acessar, baixar e pedir
            correção ou exclusão dos dados.
          </li>
          <li>
            <strong>Cabe ao profissional</strong> responder aos pedidos dos alunos registrados
            em Configurações › Privacidade em até {REQUEST_RESPONSE_DAYS} dias, e executar as
            exclusões solicitadas pela ferramenta do próprio app.
          </li>
          <li>
            O Trackly mantém medidas de segurança técnicas e administrativas (isolamento por
            conta, armazenamento privado de fotos, criptografia em trânsito) e só usa os
            suboperadores listados na{" "}
            <Link href="/privacidade" className="text-brand hover:underline">
              Política de Privacidade
            </Link>
            , avisando antes de incluir novos.
          </li>
          <li>
            Em caso de incidente de segurança com os dados dos alunos, o Trackly avisa o
            profissional sem demora injustificada, com as informações necessárias para a
            comunicação à ANPD e aos titulares (art. 48).
          </li>
          <li>
            Ao encerrar a conta, o profissional pode exportar os dados dos alunos; depois disso
            eles são apagados, exceto o que a lei obrigar a manter.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Alunos">
        <p>
          O aluno acessa o portal por convite do profissional. O conteúdo das orientações,
          treinos e planos alimentares é de responsabilidade exclusiva do profissional.
        </p>
      </LegalSection>

      <LegalSection title="5. Encerramento">
        <p>
          Você pode encerrar sua conta a qualquer momento em Configurações › Privacidade. Podemos
          suspender contas que violem estes termos ou a lei.
        </p>
      </LegalSection>

      <LegalSection title="6. Contato e foro">
        <p>
          Dúvidas: {CONTROLLER.dpoEmail}. Estes termos seguem a lei brasileira; fica eleito o
          foro do domicílio do consumidor.
        </p>
      </LegalSection>
    </article>
  );
}
