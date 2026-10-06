import { useState, useEffect } from 'react';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import format from 'date-fns/format';
import parse from 'date-fns/parse';
import startOfWeek from 'date-fns/startOfWeek';
import getDay from 'date-fns/getDay';
import { es } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { supabase } from '@4s-clima/shared/supabase';
import { useNavigate } from 'react-router-dom';
import { WORK_ORDER_STATUS } from '@4s-clima/shared/constants';

const locales = {
  'es': es,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

export default function CalendarPage() {
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadEvents();
    
    const channel = supabase
      .channel('calendar-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, () => loadEvents())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadEvents() {
    try {
      const { data, error } = await supabase
        .from('work_orders')
        .select(`
          id, 
          order_number, 
          scheduled_date, 
          scheduled_time, 
          status,
          client:clients(name),
          assigned:users!work_orders_assigned_to_fkey(name)
        `)
        .order('scheduled_date', { ascending: true });

      if (error) throw error;

      const calendarEvents = data
        .filter(wo => wo.scheduled_date)
        .map(wo => {
          let startDate = new Date(wo.scheduled_date + 'T00:00:00');
          let endDate = new Date(wo.scheduled_date + 'T23:59:59');

          if (wo.scheduled_time) {
            startDate = new Date(`${wo.scheduled_date}T${wo.scheduled_time}`);
            // By default let's assume a work order takes 2 hours
            endDate = new Date(startDate.getTime() + 2 * 60 * 60 * 1000);
          }

          return {
            id: wo.id,
            title: `${wo.client?.name || 'Cliente'} - ${wo.assigned?.name || 'Sin técnico'}`,
            start: startDate,
            end: endDate,
            resource: wo
          };
        });

      setEvents(calendarEvents);
    } catch (err) {
      console.error('Error loading calendar events', err);
    } finally {
      setIsLoading(false);
    }
  }

  const handleSelectEvent = (event) => {
    navigate(`/ordenes?search=${event.resource.order_number}`);
  };

  const eventStyleGetter = (event) => {
    let backgroundColor = '#3b82f6'; // default blue
    if (event.resource.status === WORK_ORDER_STATUS.COMPLETED) {
      backgroundColor = '#10b981'; // emerald
    } else if (event.resource.status === WORK_ORDER_STATUS.IN_PROGRESS) {
      backgroundColor = '#f59e0b'; // amber
    }

    return {
      style: {
        backgroundColor,
        borderRadius: '5px',
        opacity: 0.9,
        color: 'white',
        border: '0px',
        display: 'block'
      }
    };
  };

  return (
    <div className="h-full flex flex-col">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Calendario de Programación</h1>
        <p className="text-gray-500 text-sm mt-1">Visualiza las órdenes de trabajo programadas</p>
      </div>

      <div className="flex-1 bg-white p-4 rounded-xl border border-gray-200 shadow-sm min-h-[600px]">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <Calendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            style={{ height: '100%' }}
            messages={{
              next: "Sig",
              previous: "Ant",
              today: "Hoy",
              month: "Mes",
              week: "Semana",
              day: "Día"
            }}
            culture='es'
            onSelectEvent={handleSelectEvent}
            eventPropGetter={eventStyleGetter}
            popup
          />
        )}
      </div>
    </div>
  );
}
