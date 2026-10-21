import { useState } from 'react'
import { BriefComposer, BriefList } from '../components/Briefs'
import { Icon } from '../components/Icon'
import { Empty, ErrorNote, Loading, PageHeader } from '../components/ui'
import { listBriefs, listProjects } from '../lib/api'
import { useAsync } from '../lib/hooks'

export function Briefs() {
  const [all, setAll] = useState(false)
  const [composing, setComposing] = useState(false)
  const { data, error, loading, reload } = useAsync(() => Promise.all([listBriefs({ active: !all }), listProjects()]), [all])

  return (
    <div className="page">
      <PageHeader
        kicker="Studio to projects"
        title="Briefs"
        actions={
          <button className="btn btn-primary" onClick={() => setComposing(true)}>
            <Icon name="plus" size={16} /> New brief
          </button>
        }
      />
      <div className="toolbar">
        <div className="segmented">
          <button className={!all ? 'on' : ''} onClick={() => setAll(false)}>Active</button>
          <button className={all ? 'on' : ''} onClick={() => setAll(true)}>All</button>
        </div>
      </div>
      {error ? <ErrorNote message={error} /> : loading || !data ? <Loading /> : data[0].length ? (
        <section className="panel">
          <BriefList briefs={data[0]} onChange={reload} />
        </section>
      ) : (
        <Empty>
          No {all ? '' : 'active '}briefs. Write one and the project's Claude picks it up at the start of its next session.
        </Empty>
      )}
      {composing && data && <BriefComposer projects={data[1]} onClose={() => setComposing(false)} onSaved={reload} />}
    </div>
  )
}
