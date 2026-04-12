export default function Footer() {
  return (
    <footer style={{
      maxWidth: '1400px', margin: '0 auto',
      borderLeft: '1px solid #d9d9d9', borderRight: '1px solid #d9d9d9',
      borderTop: '1px solid #d9d9d9',
      padding: '24px', textAlign: 'center',
    }}>
      <p style={{ fontSize: '12px', color: '#999' }}>
        &copy; {new Date().getFullYear()} Utterlog. Powered by Lared Theme.
      </p>
    </footer>
  );
}
