import React from 'react';
import Dropdown from '../../../components/Dropdown.jsx';
import { SEGMENT_OPTIONS, SEGMENT_TYPES } from '../constants';

export default function SegmentsSection({
  segmentSettings,
  onSegmentChange,
}) {
  return (
    <article className="round surface-container no-margin" style={{ padding: '20px 24px', overflow: 'visible' }}>
      <div style={{ marginBottom: '20px' }}>
        <h6 style={{ margin: 0, fontWeight: 500, fontSize: '16px' }}>Сегменти</h6>
        <p className="small-text surface-variant-text" style={{ margin: '4px 0 0 0' }}>
          Налаштування відображення та пропуску заставок, титрів і фрагментів серій.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {SEGMENT_TYPES.map((seg, idx) => (
          <React.Fragment key={seg.key}>
            {idx > 0 && <div className="divider" style={{ margin: 0 }}></div>}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '180px' }}>
                <span
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor: seg.color,
                    flexShrink: 0,
                  }}
                />
                <div>
                  <div style={{ fontWeight: 500, fontSize: '15px' }}>{seg.title}</div>
                  <div className="small-text surface-variant-text" style={{ fontSize: '12px' }}>
                    {seg.description}
                  </div>
                </div>
              </div>
              <Dropdown
                value={segmentSettings[seg.key] || 'manual'}
                options={SEGMENT_OPTIONS}
                onChange={(val) => onSegmentChange(seg.key, val)}
              />
            </div>
          </React.Fragment>
        ))}
      </div>
    </article>
  );
}
