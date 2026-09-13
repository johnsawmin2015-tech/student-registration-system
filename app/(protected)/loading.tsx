export default function Loading() {
  return (
    <div className="stack" aria-busy="true" aria-label="Loading page">
      <div className="skeleton" />
      <div className="summary-grid">
        <div className="skeleton" />
        <div className="skeleton" />
        <div className="skeleton" />
        <div className="skeleton" />
      </div>
      <div className="skeleton" />
    </div>
  )
}
