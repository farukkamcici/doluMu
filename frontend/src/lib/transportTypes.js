export const TRANSPORT_TYPES = {
  1: {
    id: 1,
    name: 'Bus',
    label: 'Otobüs',
    bgColor: 'bg-blue-500/20',
    textColor: 'text-blue-400',
    borderColor: 'border-blue-500/30'
  },
  2: {
    id: 2,
    name: 'Rail',
    label: 'Metro',
    bgColor: 'bg-purple-500/20',
    textColor: 'text-purple-400',
    borderColor: 'border-purple-500/30'
  },
  3: {
    id: 3,
    name: 'Ferry',
    label: 'Vapur',
    bgColor: 'bg-cyan-500/20',
    textColor: 'text-cyan-400',
    borderColor: 'border-cyan-500/30'
  }
};

export const ROAD_TYPES = {
  'OTOYOL': {
    label: 'Karayolu',
    icon: '🛣️'
  },
  'RAYLI': {
    label: 'Raylı',
    icon: '🚊'
  },
  'DENİZ': {
    label: 'Deniz',
    icon: '🌊'
  }
};

export const getTransportType = (typeId) => {
  return TRANSPORT_TYPES[typeId] || {
    id: typeId,
    name: 'Unknown',
    label: 'Bilinmiyor',
    bgColor: 'bg-gray-500/20',
    textColor: 'text-gray-400',
    borderColor: 'border-gray-500/30'
  };
};

export const getRoadType = (roadType) => {
  return ROAD_TYPES[roadType] || {
    label: roadType,
    icon: '🚏'
  };
};