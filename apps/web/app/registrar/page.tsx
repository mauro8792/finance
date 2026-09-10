import { RegistrarModes } from "../../components/RegistrarModes";
import { PageHeader } from "../../components/ui/PageHeader";
import styles from "./page.module.css";

export default function RegistrarPage() {
  return (
    <div className={styles.page}>
      <PageHeader
        kicker="Registrar"
        title="Cargar movimiento"
        description="Un gasto o un ingreso en segundos. La moneda sale de la cuenta elegida."
      />
      <RegistrarModes />
    </div>
  );
}
