import Head from "next/head";
export default function Disclaimer() {
  return (
    <>
      <Head><title>Disclaimer — Follow The Money</title></Head>
      <main style={{maxWidth:"720px",margin:"2rem auto",padding:"0 1rem",color:"rgb(203 213 225)"}}>
        <h1 style={{fontSize:"1.5rem",fontWeight:600,color:"#fff",marginBottom:"0.75rem"}}>Disclaimer</h1>
        <p style={{marginBottom:"0.75rem"}}>
          The information provided by Follow The Money is for educational purposes only and is not financial advice.
          Trading involves risk. You are responsible for your own decisions.
        </p>
        <p>Data may be delayed or incomplete depending on provider limitations. No warranty is expressed or implied.</p>
      </main>
    </>
  );
}
