import { QuickAddForm } from "../../components/QuickAddForm";
import styles from "./page.module.css";

export default function RegistrarPage() {
  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <h1 className={styles.title}>Registrar</h1>
        <p className={styles.lead}>
          Cargá un gasto o un ingreso en segundos. La moneda sale de la cuenta
          elegida.
        </p>
      </header>
      <QuickAddForm />
    </div>
  );
}
