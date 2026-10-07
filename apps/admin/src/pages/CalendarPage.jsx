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
          const [year, month, day] = wo.scheduled_date.split('-').map(Number);
          let startDate = new Date(year, month - 1, day, 8, 0, 0); // Default 08:00
          let endDate = new Date(year, month - 1, day, 10, 0, 0);

          if (wo.scheduled_time) {
            const [hours, minutes] = wo.scheduled_time.split(':').map(Number);
            startDate = new Date(year, month - 1, day, hours, minutes, 0);
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
    let className = 'calendar-event-pending';
    if (event.resource.status === WORK_ORDER_STATUS.COMPLETED) {
      className = 'calendar-event-completed';
    } else if (event.resource.status === WORK_ORDER_STATUS.IN_PROGRESS) {
      className = 'calendar-event-inprogress';
    }
    return { className };
  };

  const CustomAgendaEvent = ({ event }) => {
    let colorClass = 'bg-brand-500';
    if (event.resource.status === WORK_ORDER_STATUS.COMPLETED) colorClass = 'bg-emerald-500';
    if (event.resource.status === WORK_ORDER_STATUS.IN_PROGRESS) colorClass = 'bg-amber-500';

    return (
      <div className="flex items-center gap-2 py-1">
        <div className={`w-3 h-3 rounded-full flex-shrink-0 ${colorClass}`} />
        <span className="font-medium text-gray-900 dark:text-gray-100">{event.title}</span>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Calendario de Programación</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Visualiza las órdenes de trabajo programadas</p>
      </div>

      <div className="flex-1 bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm min-h-[700px] calendar-container">
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
            style={{ minHeight: 650 }}
            defaultView="week"
            messages={{
              next: "Sig",
              previous: "Ant",
              today: "Hoy",
              month: "Mes",
              week: "Semana",
              day: "Día",
              agenda: "Agenda"
            }}
            culture='es'
            onSelectEvent={handleSelectEvent}
            eventPropGetter={eventStyleGetter}
            components={{
              agenda: {
                event: CustomAgendaEvent
              }
            }}
            popup
            step={30}
            timeslots={2}
            dayLayoutAlgorithm="no-overlap"
          />
        )}
      </div>
    </div>
  );
}
