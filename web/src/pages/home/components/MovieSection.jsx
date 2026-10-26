import React from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import 'swiper/css';
import { Mousewheel } from 'swiper/modules';
import MovieCard from '../../../components/MovieCard';

export default function MovieSection({ title, items, isHero = false }) {
  if (!items || items.length === 0) return null;

  return (
    <div style={{ marginBottom: '32px' }}>
      {!isHero && (
        <h5 style={{ marginLeft: '24px', marginBottom: '16px', fontWeight: 500 }}>
          {title}
        </h5>
      )}
      <Swiper
        modules={[Mousewheel]}
        mousewheel={{ forceToAxis: true }}
        spaceBetween={16}
        slidesPerView={'auto'}
        style={{ paddingLeft: '24px', paddingRight: '24px' }}
      >
        {items.map((item) => (
          <SwiperSlide key={item.id} style={{ width: isHero ? 'min(85vw, 640px)' : '140px' }}>
            <MovieCard movie={item} isHero={isHero} />
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  );
}
