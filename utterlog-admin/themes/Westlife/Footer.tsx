export default function Footer() {
  return (
    <footer style={{ background: '#f4f6f8', borderTop: '1px solid #e9e9e9', padding: '32px 40px', textAlign: 'center' }}>
      <p style={{ fontSize: '13px', color: '#6b7280' }}>
        &copy; {new Date().getFullYear()} Utterlog. Powered by Westlife Theme.
      </p>
    </footer>
  );
}
